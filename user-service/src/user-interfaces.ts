import { User } from "./db";

export interface SyncUserBody {
  params: { id: string };
  Body: Partial<User>;
}

export interface userChangeAvatarPayload {
  avatar?: number;
  bike?: number;
}

export interface ProfilePicturePayload {
  profilePicture: string;
}