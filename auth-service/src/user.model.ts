import { FastifyRequest, FastifyReply } from 'fastify';
import { findUser, getUserById, setTwoFaById, getTwoFaById, getDbPassword, changeDbPassword, removeUserFromDb, getIsConnected, setIsConnected } from './services/db.service';
import { dbPromise } from './services/db.service';
import bcrypt from 'bcrypt';
import { JwtUserPayload, signAccessJwt, sign2FAChallengeJwt, verifyAccessJwt } from './services/jwt.service';
import { verify2faCode, generateQRCode } from './2fa';
import { verify } from 'node:crypto';
import { decode2FAChallengeJwt } from './services/jwt.service';
import { createUser, start2FAChallenge } from './login';
import { generate2FASecret } from './2fa'
import { syncUserWithUserService, deleteUserFromServices } from './utils/synchWithUserService';
import { validateUsername, validatePassword, validate2FACode } from './utils/validation';
import "@fastify/cookie";

import { returnError } from "./utils/errorDisplay";



// ==================== SIGNUP PART ====================

export interface UserSignupBody {
  password: string;
  confirmPassword: string;
  username: string;
  twofa: boolean;
}

export interface UserLoginBody {
  username: string;
  password: string;
  forceLogin?: boolean; // Force disconnect other sessions
}

export interface User {
  id: number;
  username: string;
  createdAt: string;
  hashedPassword?: string;
  twofa?: number;
  twofa_secret?: string;
  qrCodeUrl?: string;
}

export interface changePassword {
  old: string;
  new: string;
  newConfirm: string;
  twoFaCode?: string;
}

export interface removeUserBody {
  password: string;
  twoFaCode?: string;
}

// define nulbers of bcryot rounds
const ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);



// ========== CONNECTION PART ==========

// ========== Login function ==========
export async function userLogin(req: FastifyRequest<{ Body: UserLoginBody }>, reply: FastifyReply) {
  try {
    // Check if user is already logged in
    if (req.cookies.access_token) {
      try {
        const decoded = verifyAccessJwt(req.cookies.access_token);
        if (decoded) {
          return returnError(req, reply, "You are already logged in", 403);
        }
      } catch (e) {
        // Token invalid, proceed
      }
    }

    const db = await dbPromise;
    const { username, password } = req.body;
    if (!username || !password) { return returnError(req, reply, "[ERROR]: Missing username or password", 400); }

    // Validate username input
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) { return returnError(req, reply, (usernameValidation.error as string), 400); }

    let userRow = await findUser(db, username);
    if (!userRow) { return returnError(req, reply, "User not found", 404); }

    if (!userRow.hashedPassword) { return returnError(req, reply, "hashedPassword do not finded", 400); }

    const isValid = await bcrypt.compare(password, userRow.hashedPassword);
    if (!isValid) { return returnError(req, reply, "Invalid password", 401); }

    const isAlreadyConnected = await getIsConnected(db, userRow.id);
    if (isAlreadyConnected) {
      const { forceLogin } = req.body;
      if (!forceLogin) {
        return reply.status(409).send({
          success: false,
          error: "User is already connected on another device/browser",
          canForceLogin: true
        });
      }
      console.log(`[INFO]: User ${userRow.id} forcing login, will disconnect other sessions`);
    }

    if (!userRow.id) { return returnError(req, reply, "user id missing", 500); }

    const twoFA = await getTwoFaById(db, userRow.id);
    let challengeToken = null, qrCodeUrl = null, twoFaRequired = false;

    if (twoFA) {
      const result = await start2FAChallenge(db, userRow.id);
      if (!result) { return returnError(req, reply, "2FA challenge failed", 500); }

      twoFaRequired = true;
      challengeToken = result.challengeToken;
      qrCodeUrl = result.qrCodeUrl;
    } else {
      const accessToken = signAccessJwt({
        userId: userRow.id,
        username: userRow.username,
        mfaVerified: true,
      });

      reply.setCookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    }

    await syncUserWithUserService(userRow);

    return reply.send({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: userRow.id,
          username: userRow.username,
          twoFaRequired: twoFaRequired,
          challengeToken: challengeToken,
          qrCodeUrl: qrCodeUrl
        },
      },
    });

  } catch (error) {
    req.log.error({ "User login: ": error });
    return reply.status(500).send({ success: false, error: "Internal server error" });
  }
}


// ========== Signup function ==========
export async function userSignup(req: FastifyRequest<{ Body: UserSignupBody }>, reply: FastifyReply) {
  try {
    if (req.cookies.access_token) {
      try {
        const decoded = verifyAccessJwt(req.cookies.access_token);
        if (decoded) {
          return returnError(req, reply, "You are already logged in", 403);
        }
      } catch (e) {
      }
    }

    const db = await dbPromise;
    const { username, password, confirmPassword, twofa } = req.body;
    if (!username || !password || !confirmPassword) {
      console.log("[ERROR]: Missing username, password or confirmPassword");
      return returnError(req, reply, "Missing username, password or confirmPassword", 400);
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return returnError(req, reply, usernameValidation.error as string, 400);
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return returnError(req, reply, passwordValidation.error as string, 400);
    }

    let userRow = await findUser(db, username);
    if (userRow) {
      console.log("[INFO]: User already exists");
      return returnError(req, reply, "User already exists", 409);
    }

    if (password !== confirmPassword) {
      return returnError(req, reply, "User password and confirmPassword don't match", 400);
    }

    const res = await createUser(db, username, password, twofa);
    if (!res) {
      console.log("[ERROR]: user not created correctly");
      return returnError(req, reply, "User not created correctly", 400);
    }

    userRow = await findUser(db, username);
    if (!userRow) {
      console.log("[ERROR]: User retrieval failed after creation");
      return returnError(req, reply, "User retrieval failed", 500);
    }

    if (!userRow.hashedPassword) {
      console.log("[ERROR]: hashedPassword do not finded");
      return returnError(req, reply, "Password not set", 400);
    }

    const isValid = await bcrypt.compare(password, userRow.hashedPassword);
    if (!isValid) {
      return returnError(req, reply, "Invalid password", 401);
    }

    if (!userRow.id) {
      console.error("[ERROR]: user id missing");
      return returnError(req, reply, "User data invalid", 500);
    }

    let challengeToken = null, qrCodeUrl = null, twoFaRequired = false;

    if (twofa) {
      const twofaRes = await start2FAChallenge(db, userRow.id);
      if (!twofaRes) {
        return returnError(req, reply, "2fa challenge failed", 500);
      }

      twoFaRequired = true;
      challengeToken = twofaRes.challengeToken;
      qrCodeUrl = twofaRes.qrCodeUrl;
      await setTwoFaById(db, userRow.id, twofa);
    } else {
      const accessToken = signAccessJwt({
        userId: userRow.id,
        username: userRow.username,
        mfaVerified: true,
      });

      reply.setCookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 1 day
      });
    }

    await syncUserWithUserService(userRow);
    return reply.send({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: userRow.id,
          username: userRow.username,
          twoFaRequired: twoFaRequired,
          challengeToken: challengeToken,
          qrCodeUrl: qrCodeUrl
        },
      },
    });
  }
  catch (error) {
    req.log.error({ "userLogin: ": error });
    return returnError(req as any, reply, "Internal server error", 500);
  }
}


// ========== 2FA verification (6 digit code) ==========
export async function verify2faToken(request: FastifyRequest<{ Body: { twoFaCode: string; challengeToken: string } }>, reply: FastifyReply) {
  try {
    const db = await dbPromise;
    const { twoFaCode, challengeToken } = request.body;

    if (!twoFaCode || !challengeToken) {
      return returnError(request, reply, "Missing 2FA code or challenge token", 400);
    }

    const codeValidation = validate2FACode(twoFaCode);
    if (!codeValidation.valid) {
      return returnError(request, reply, codeValidation.error as string, 400);
    }

    const payload = decode2FAChallengeJwt(challengeToken);
    if (!payload || !payload.userId) {
      return returnError(request, reply, "Invalid or expired challenge token", 401);
    }

    const userRow = await getUserById(db, payload.userId);
    if (!userRow || !userRow.twofa_secret) {
      return returnError(request, reply, "User not found or 2FA not configured", 401);
    }

    const valid = await verify2faCode(userRow.twofa_secret, twoFaCode);
    if (!valid) {
      return returnError(request, reply, "Invalid 2FA code", 401);
    }

    console.log("[INFO]: Send username and user id to user-service for syncing");
    await syncUserWithUserService({ id: userRow.id, username: userRow.username, createdAt: userRow.createdAt });

    const accessToken = signAccessJwt({
      userId: userRow.id,
      username: userRow.username,
      mfaVerified: true,
    });

    const COOKIE_OPTIONS = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    reply.setCookie("access_token", accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 24 * 60 * 60,
    });

    return reply.status(200).send({
      success: true,
      message: "2FA verification successful",
      data: {
        user: {
          id: userRow.id,
          username: userRow.username,
        },
      },
    });

  } catch (err) {
    console.error("[ERROR] verify2faToken:", err);
    return returnError(request, reply, "Internal server error", 500);
  }
}


// ========== Get all users ========= 
export async function getUsers(request: FastifyRequest, reply: FastifyReply) {
  const db = dbPromise;
  try {
    const users = await (await db).all<User[]>('SELECT id, username, createdAt FROM users');
    return reply.status(200).send({ users });
  } catch (error) {
    console.error('[ERROR] Error fetching users', error);
    return returnError(request, reply, 'Internal server error', 500);
  }
}


// =========== Change User password ==========
export async function changeUserPassword(request: FastifyRequest<{ Body: changePassword }>, reply: FastifyReply) {
  try {
    const db = await dbPromise;
    const { old, new: newpass, newConfirm } = request.body;

    const userIdHeader = request.headers['x-user-id'];
    if (!userIdHeader) {
      return returnError(request, reply, "Unauthorized - missing user ID", 401);
    }

    const userId = Number(userIdHeader);
    if (isNaN(userId)) {
      return returnError(request, reply, "Invalid user ID", 400);
    }

    if (!old || !newpass || !newConfirm) {
      console.log("[ERROR] At least one field is empty");
      return returnError(request, reply, "All fields are required", 400);
    }

    if (newpass !== newConfirm) {
      console.log("[ERROR] New password and confirmation do not match");
      return returnError(request, reply, "New password and confirmation do not match", 400);
    }

    if (newpass.length < 8) {
      console.log("[ERROR] Password too short");
      return returnError(request, reply, "Password must be at least 8 characters", 400);
    }

    const passwordValidation = validatePassword(newpass);
    if (!passwordValidation.valid) {
      return returnError(request, reply, passwordValidation.error as string, 400);
    }

    // Fetch DB password and user to check 2FA status
    const userRow = await getUserById(db, userId);
    if (!userRow) {
      return returnError(request, reply, "User not found", 404);
    }

    // If user has 2FA enabled, require twoFaCode (or validate it when provided)
    const has2FA = userRow.twofa === 1;
    const twoFaCode = (request.body as any).twoFaCode as string | undefined;
    // Debug log (do NOT log password contents)
    request.log.info({ userId, has2FA, twoFaProvided: !!twoFaCode }, 'changePassword attempt');
    if (has2FA && (!twoFaCode || twoFaCode.trim().length === 0)) {
      // Signal the frontend that 2FA is required for this action
      return reply.status(400).send({ success: false, error: '2FA required', requires2FA: true });
    }

    if (has2FA && twoFaCode) {
      // validate format
      const codeValidation = validate2FACode(twoFaCode);
      if (!codeValidation.valid) {
        return returnError(request, reply, codeValidation.error as string, 400);
      }
      // verify code against stored secret
      if (!userRow.twofa_secret) {
        return returnError(request, reply, '2FA not configured', 400);
      }
      const valid2fa = await verify2faCode(userRow.twofa_secret, twoFaCode);
      if (!valid2fa) {
        return returnError(request, reply, 'Invalid 2FA code', 401);
      }
    }

    const dbPassword = await getDbPassword(db, userId);
    if (!dbPassword) {
      console.log("[ERROR] password from db is empty");
      return returnError(request, reply, "User not found or no password set", 404);
    }

    const isValid = await bcrypt.compare(old, dbPassword);
    request.log.info({ userId, oldPasswordCorrect: !!isValid }, 'changePassword old password check');
    if (!isValid) {
      return returnError(request, reply, "Invalid current password", 401);
    }

    const hashedPassword = await bcrypt.hash(newpass, ROUNDS);
    await changeDbPassword(db, userId, hashedPassword);

    return reply.status(200).send({ success: true, message: "Password changed successfully" });
  }
  catch (err) {
    console.error("[ERROR]", err);
    return returnError(request, reply, "Internal server error", 500);
  }

};

// =========== Remove user ==========
export async function removeUser(request: FastifyRequest<{ Body: removeUserBody }>, reply: FastifyReply) {
  try {
    const db = await dbPromise;

    // Get user ID from header (injected by gateway from JWT - secure)
    const userIdHeader = request.headers['x-user-id'];
    if (!userIdHeader) {
      return returnError(request, reply, "Unauthorized - missing user ID", 401);
    }

    const userId = Number(userIdHeader);
    if (isNaN(userId)) {
      return returnError(request, reply, "Invalid user ID", 400);
    }

    // Get user data to check 2FA status
    const user = await getUserById(db, userId);
    if (!user) {
      return returnError(request, reply, "User not found", 404);
    }

    // Check if 2FA is enabled and verify code
    const has2FA = user.twofa === 1;
    let twoFAVerified = false;
    if (has2FA && user.twofa_secret) {
      const { twoFaCode } = request.body;
      if (!twoFaCode) {
        return reply.status(400).send({
          success: false,
          error: "2FA code required",
          requires2FA: true
        });
      }

      const isValid2FA = await verify2faCode(user.twofa_secret, twoFaCode);
      if (!isValid2FA) {
        return returnError(request, reply, "Invalid 2FA code", 401);
      }
      twoFAVerified = true;
    }

    // Get password from body
    const { password } = request.body;
    if (!password) {
      return reply.status(400).send({ success: false, error: "Password is empty" });
    }

    // Call DB service to remove user (skip password check if 2FA was verified)
    const res = await removeUserFromDb(db, userId, password || '', twoFAVerified);

    if (!res.success) {
      if (res.error === "User not found") {
        return returnError(request, reply, res.error, 404);
      }
      if (res.error === "Invalid password") {
        return returnError(request, reply, res.error, 401);
      }
      return returnError(request, reply, res.error || "User not removed correctly", 400);
    }

    await deleteUserFromServices(userId);

    // Clear auth cookie on successful deletion
    (reply as any).setCookie("access_token", "", { path: "/", maxAge: 0 });

    return reply.status(200).send({ success: true, message: res.message || "User removed successfully" });
  }
  catch (err) {
    request.log.error({ err }, "[ERROR] removeUser function failed");
    return returnError(request, reply, "Internal server error", 500);
  }
}
