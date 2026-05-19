import { AbstractMesh, Scene, Vector3, ImportMeshAsync, TransformNode, Mesh, MeshBuilder, Color3, Color4, StandardMaterial, GlowLayer, Observer } from '@babylonjs/core';
import "@babylonjs/loaders";
import { Bike } from "./Bike.ts";
import { scene, shadowGenerator } from "../utils/babylonInit.ts";
import { updateUser, type User } from '../utils/usersManagement.ts';
// import { KeyBinds } from "./Keybinds.ts";

/*
Infos to store in DB:
	id: string;
	username: string;
	skinID: number;
	bikeID: number;
	keyBinds: KeyBinds;
	currentGameID: string | null;
	currentTournamentID: string | null;
	stats: Stats;
	status?: 'ONLINE' | 'OFFLINE';

	KeyBinds:
		left: string;
		right: string;
		interact/use: string;
	
	Stats:
		gamesPlayed: number;
		gamesWon: number;
		tournamentsPlayed: number;
		tournamentsWon: number;
*/

enum State { IDLE = 'idle', RUN = 'run', ONBIKE = 'onBike', HIDDEN = 'hidden' }
enum Direction { RIGHT = 'right', LEFT = 'left' }

const modelPath = [
	"/assets/characters/Character-0/",
	"/assets/characters/Character-1/",
	"/assets/characters/Character-2/",
	"/assets/characters/Character-3/",
	// "/assets/characters/Character-4/",
	// "/assets/characters/Character-5/",
	// "/assets/characters/Character-6/",
	// "/assets/characters/Ninja/"
];

const onBikeFiles = [
	"OnChopper.obj",
	"OnCross.obj",
	"OnGunBike.obj",
	"OnScooter.obj",
	"OnTracer.obj"
];

export class Player {
	private _accountID: number;
	private _username: string;
	private _position: Vector3;
	private _skinID: number;
	private _modelsPath: string;
	private _idle?: AbstractMesh;
	private _run?: AbstractMesh;
	private _onBike?: TransformNode;
	private _inGame?: TransformNode;
	private _state: State;
	private _direction: Direction;
	private _tiltTarget = 0;
	private _iconPath: string;
	private _profilePicture: string | null = null;
	private _weapon: Mesh;
	private _currentObserver: Observer<Scene> | null = null;
	private _animationRunning: boolean = false;
	bike: Bike;

	constructor(accountID: number, skinID: number, bikeID: number, username: string, hidden?: boolean) {
		this._accountID = accountID;
		this._username = username;
		this._state = State.IDLE;
		this._direction = Direction.RIGHT;
		
		let scale = 40, idleRotation = -Math.PI / 4, runRotation = -Math.PI / 2;
		
		if (skinID < 0 || skinID > 3 /* 7 */)
			skinID = 0;

		this._skinID = skinID;

		// if (skinID === 7) {
		// 	scale = 0.05;
		// 	idleRotation = 3 * Math.PI / 4;
		// 	runRotation = Math.PI / 2;
		// }

		this._modelsPath = modelPath[skinID];

		this._position = window.innerWidth > 500 ?  new Vector3(3, 9, 0) : new Vector3(1.5, 9, 0);
		this._iconPath = this._modelsPath + "Icon.png";

		ImportMeshAsync(this._modelsPath + "Idle.glb", scene).then((result) => {
			this._idle = result.meshes[0];
			this._idle.name = "idle " + this._username;
			this._idle.setEnabled(false);
			this._idle.position = this._position;
			this._idle.scaling.set(scale, scale, scale);

			this._idle.rotation = new Vector3(0, idleRotation, 0);

			if (result.animationGroups.length > 0)
				result.animationGroups[0].start(true);
			this._idle.setEnabled(true);
			shadowGenerator.addShadowCaster(this._idle, true);
		});

		ImportMeshAsync(this._modelsPath + "Running.glb", scene).then((result) => {
			this._run = result.meshes[0];
			this._run.setEnabled(false);
			this._run.name = "running " + this._username;
			if (this._idle) {
				this._run.position = this._idle.position;
				this._run.scaling = this._idle.scaling;
			}
			else {
				this._run.position = this._position;
				this._run.scaling.set(scale, scale, scale);
			}

			this._run.rotation = new Vector3(0, runRotation, 0);

			if (result.animationGroups.length > 0)
				result.animationGroups[0].start(true);
			shadowGenerator.addShadowCaster(this._run, true);
		});

		this._weapon = this.createWeapon(new Vector3(0, 10, 0), 5);
		this._inGame = new TransformNode("inGame", scene);

		this.bike = new Bike(bikeID);
		this.loadOnBikeModel();

		if (hidden) {
			setTimeout(() => {
				this.setState(State.HIDDEN);
			}, 300);
		}
	}

	private createWeapon(position: Vector3, size: number, color: Color3 = new Color3(0, 1, 0)): Mesh {
		const weapon = MeshBuilder.CreateBox("weapon", {
			height: size,
			width: 1
		}, scene);

		weapon.position = position;
		weapon.rotation = new Vector3(Math.PI / 2, 0, Math.PI / 2);

		const material = new StandardMaterial("invisibleMat", scene);
		material.alpha = 0.5;
		material.diffuseColor = color;
		weapon.material = material;

		weapon.enableEdgesRendering();
		// weapon.edgesWidth = 5.0; // Thickness of edge lines
		weapon.edgesWidth = size;
		weapon.edgesColor = new Color4(color.r, color.g, color.b, 1);

		const glowLayer = new GlowLayer("glow", scene);
		glowLayer.addIncludedOnlyMesh(weapon);
		glowLayer.intensity = 1.5;

		weapon.setEnabled(false);

		return (weapon);
	}

	getState(): State {
		return (this._state);
	}

	setState(state: string): void {
		if (state === this._state)
			return;

		if (state === State.IDLE) {
			if (this._state === State.ONBIKE) {
				if (this._idle)
					this._idle.position = this._position;
				if (this._run)
					this._run.position = this._position;
			}
			this._state = State.IDLE;
			this.bike.setState("idle");
			if (this._run)
				this._run.setEnabled(false);
			if (this._idle)
				this._idle.setEnabled(true);
			if (this._inGame)
				this._inGame.setEnabled(false);
		}
		else if (state === State.RUN) {
			this._state = State.RUN;
			this.bike.setState("idle");
			if (this._idle)
				this._idle.setEnabled(false);
			if (this._run)
				this._run.setEnabled(true);
			if (this._inGame)
				this._inGame.setEnabled(false);
		}
		else if (state === State.ONBIKE) {
			this._state = State.ONBIKE;
			this.bike.setState("hidden");
			if (this._idle)
				this._idle.setEnabled(false);
			if (this._run)
				this._run.setEnabled(false);
			if (this._inGame)
				this._inGame.setEnabled(true);
		}
		else /* if (state === State.HIDDEN) */ {
			this._state = State.HIDDEN;
			this.bike.setState("hidden");
			if (this._idle)
				this._idle.setEnabled(false);
			if (this._run)
				this._run.setEnabled(false);
			if (this._inGame)
				this._inGame.setEnabled(false);
		}
	}

	resetPosition(): void {
		this._position = window.innerWidth > 500 ?  new Vector3(3, 9, 0) : new Vector3(1.5, 9, 0);
		if (this._idle) {
			this._idle.position = this._position;
			this._idle.rotation.y = /* this._skinID === 7 ? 3 * Math.PI / 4 : */ -Math.PI / 4;
		}
		if (this._run) {
			this._run.position = this._position;
			this._run.rotation.y = /* this._skinID === 7 ? Math.PI / 2 : */ -Math.PI / 2;
		}
		if (this._inGame) {
			this._inGame.position = new Vector3(0, 9.5, 0);
			this.onBikeIdle();
			this._inGame.rotation.y = 0;
		}
		this._direction = Direction.RIGHT;
	}

	changeSkin(id: number): void {
		if (id === this._skinID)
			return;

		let scale = 40, idleRotation = -Math.PI / 4, runRotation = -Math.PI / 2;

		if (id < 0 || id > 3/* 7 */) {
			console.error("Incorrect player skin id.");
			return;
		}

		/* if (id === 7) {
			scale = 0.05;
			idleRotation = 3 * Math.PI / 4;
			runRotation = Math.PI / 2;
		} */

		this._modelsPath = modelPath[id];

		this._skinID = id;
		updateUser({avatar: id});
		this._iconPath = this._modelsPath + "Icon.png";

		if (this._idle) {
			shadowGenerator.removeShadowCaster(this._idle, true);
			this._idle.dispose();
		}
		else if (this._run)
			if (this._run) {
				shadowGenerator.removeShadowCaster(this._run, true);
				this._run.dispose();
			}

		ImportMeshAsync(this._modelsPath + "Idle.glb", scene).then((result) => {
			this._idle = result.meshes[0];
			this._idle.name = "idle " + this._username;
			this._idle.setEnabled(false);
			this._idle.position = this._position;
			this._idle.scaling.set(scale, scale, scale);
			if (this._direction === Direction.LEFT)
				idleRotation += Math.PI / 2;
			this._idle.rotation = new Vector3(0, idleRotation, 0);

			if (this._state === State.IDLE)
				this._idle.setEnabled(true);

			if (result.animationGroups.length > 0)
				result.animationGroups[0].start(true);

			shadowGenerator.addShadowCaster(this._idle, true);
		})

		ImportMeshAsync(this._modelsPath + "Running.glb", scene).then((result) => {
			this._run = result.meshes[0];
			this._run.name = "running " + this._username;
			this._run.setEnabled(false);
			this._run.position = this._position;
			this._run.scaling.set(scale, scale, scale);
			if (this._direction === Direction.LEFT)
				runRotation += Math.PI;
			this._run.rotation = new Vector3(0, runRotation, 0);

			if (this._state === State.RUN)
				this._run.setEnabled(true);

			if (result.animationGroups.length > 0)
				result.animationGroups[0].start(true);
			shadowGenerator.addShadowCaster(this._run, true);
		})

		this.loadOnBikeModel();
	}

	changeBikeSkin(id: number): void {
		this.bike.changeSkin(id).then((result) => {
			if (result) {
				this.loadOnBikeModel();
				updateUser({ bike: id });
			}
		});
	}

	setPosition(x: number, y: number, z: number): void {
		if (this._state === State.ONBIKE)
			this._inGame?.position.set(x, y, z);
		else
			this._position.set(x, y, z);
	}

	setIdlePosition(position: Vector3): void {
		this._position = position;
		if (this._idle)
			this._idle.position = this._position;
		if (this._run)
			this._run.position = this._position;
	}

	getPosition(): Vector3 | null {
		if (this._state === State.ONBIKE && this._inGame)
			return (this._inGame.position);
		return (this._position);
	}

	setXPosition(x: number): void {
		if (this._state === State.ONBIKE && this._inGame)
			this._inGame.position.x = x;
		else
			this._position.x = x;
	}

	moveXPosition(x: number): void {
		if (this._state === State.ONBIKE && this._inGame)
			this._inGame.position.x += x;
		else
			this._position.x += x;
	}

	setYPosition(y: number): void {
		if (this._state === State.ONBIKE && this._inGame)
			this._inGame.position.y = y;
		else
			this._position.y = y;
	}

	setZPosition(z: number): void {
		if (this._state === State.ONBIKE && this._inGame)
			this._inGame.position.z = z;
		else
			this._position.z = z;
	}

	moveZPosition(z: number): void {
		if (this._state === State.ONBIKE && this._inGame)
			this._inGame.position.z += z;
		else
			this._position.z += z;
	}

	faceLeft(): void {
		if (this._direction === Direction.LEFT)
			return;

		if (this._idle) {
			const baseRotation = /* this._skinID === 7 ? 3 * Math.PI / 4 : */ -Math.PI / 4;
			this._idle.rotation.y = baseRotation + Math.PI / 2;
		}
		if (this._run) {
			const baseRotation = /* this._skinID === 7 ? Math.PI / 2  :*/ -Math.PI / 2;
			this._run.rotation.y = baseRotation + Math.PI;
		}
		this._direction = Direction.LEFT;
	}

	faceRight(): void {
		if (this._direction === Direction.RIGHT)
			return;

		if (this._idle) 
			this._idle.rotation.y = /* this._skinID === 7 ? 3 * Math.PI / 4 : */ -Math.PI / 4;
		if (this._run)
			this._run.rotation.y = /* this._skinID === 7 ? Math.PI / 2 : */ -Math.PI / 2;
		this._direction = Direction.RIGHT;
	}

	faceCamera(): void {
		if (this._idle) {
			this._idle.rotation.y = /* this._skinID === 7 ? Math.PI : */ 0;
		}
	}

	getRotation(): Vector3 | undefined {
		if (this._state === State.ONBIKE)
			return (this._inGame?.rotation);
		return (this._idle?.rotation);
	}

	async runToXPosition(x: number, speed: number): Promise<void> {
		return new Promise((resolve) => {
			if (this._state !== State.IDLE && this._state !== State.RUN || x === this._position.x || speed === 0) {
				resolve();
				return;
			}
			
			let observer: Observer<Scene> | null = null;
			const direction = x > this._position.x ? 1 : -1;
			speed = Math.abs(speed);
	
			if (direction > 0)
				this.faceLeft();
			else
				this.faceRight();
			this.setState(State.RUN);
	
			observer = scene.onBeforeRenderObservable.add(() => {
				const reachedTarget = direction > 0 ? this._position.x >= x : this._position.x <= x;
	
				if (reachedTarget) {
					if (observer) {
						scene.onBeforeRenderObservable.remove(observer);
						observer = null;
					}
					resolve();
					return;
				}
	
				this.moveXPosition(speed * direction);
			});
		})
	}

	tiltLeft(): void {
		if (this._tiltTarget === -Math.PI / 4)
			return;

		this._tiltTarget = -Math.PI / 4;
	}

	tiltRight(): void {
		if (this._tiltTarget === Math.PI / 4)
			return;

		this._tiltTarget = Math.PI / 4;
	}

	onBikeIdle(): void {
		if (this._tiltTarget === 0)
			return;

		this._tiltTarget = 0;
	}

	setYRotation(y: number): void {
		if (this._inGame)
			this._inGame.rotation.y = y;
	}

	getTiltTarget(): number {
		return (this._tiltTarget);
	}

	rotateOnBikeModel(speed?: number): void {
		if (this._onBike) {
			if (speed)
				this._onBike.rotation.z += (this._tiltTarget - this._onBike.rotation.z) * speed;
			else
				this._onBike.rotation.z = this._tiltTarget;
		}
	}
	
	getOnBikeRotation(): number {
		if (this._onBike)
			return (this._onBike.rotation.z);
		else
			return (0);
	}

	async simpleGameScreenAnimation(): Promise<void> {
		if (!this._idle || !this._run || !this._inGame || !this._onBike || this._animationRunning)
			return;

		this._animationRunning = true;

		await this.runToXPosition(-6, 0.25);
		this._inGame.position = new Vector3(-6, 9.5, 0);
		this._inGame.rotation.y = -Math.PI / 4;
		this.setState(State.ONBIKE);

		const startPos = new Vector3(-6, 9.5, 0);
		const controlPoint = new Vector3(-8, 9.5, -14);
		const endPos = new Vector3(0, 9.5, -11);

		const startRotation = -Math.PI / 4;
		const endRotation = -2 * Math.PI;

		let frame = 0;
		const totalFrames = 90;

		this._currentObserver = scene.onBeforeRenderObservable.add(() => {
			if (!this._inGame || !this._onBike || !this._animationRunning) return;

			frame++;
			const t = frame / totalFrames;

			if (t >= 1) {
				this._inGame.position.copyFrom(endPos);
				this._inGame.rotation.y = endRotation;
				this._onBike.rotation.z = 0;
				this.stopCurrentAnimation();
				return;
			}

			const eased = this.easeInOutCubic(t);

			const currentPos = this.quadraticBezier(startPos, controlPoint, endPos, eased);
			this._inGame.position.copyFrom(currentPos);
			this._inGame.rotation.y = startRotation + (endRotation - startRotation) * eased;
			this.handleCurveTilting(eased);
		});
	}

	private quadraticBezier(p0: Vector3, p1: Vector3, p2: Vector3, t: number): Vector3 {
		const oneMinusT = 1 - t;
		const x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x;
		const y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y;
		const z = oneMinusT * oneMinusT * p0.z + 2 * oneMinusT * t * p1.z + t * t * p2.z;
		return (new Vector3(x, y, z));
	}
	
	private easeInOutCubic(t: number): number {
		return (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
	}
	
	private handleCurveTilting(t: number): void {
		if (!this._onBike)
			return;
		
		let tiltAmount = 0;
		if (t < 0.3)
			tiltAmount = (t / 0.3) * (Math.PI / 4);
		else if (t < 0.7)
			tiltAmount = Math.PI / 4;
		else
			tiltAmount = Math.PI / 4 * (1 - (t - 0.7) / 0.3);
		
		this._onBike.rotation.z = tiltAmount;
	}

	private stopCurrentAnimation(): void {
		if (this._currentObserver) {
			scene.onBeforeRenderObservable.remove(this._currentObserver);
			this._currentObserver = null;
		}
		this._animationRunning = false;
	}

	waitAnimationEnd(): Promise<void> {
		return new Promise((resolve) => {
			if (!this._animationRunning) {
				resolve();
				return;
			}

			const checkAnimation = () => {
				if (!this._animationRunning)
					resolve();
				else
					requestAnimationFrame(checkAnimation);
			};

			requestAnimationFrame(checkAnimation);
		});
	}

	loadOnBikeModel(): void {
		const bikeSkinID = this.bike.getID();
		
		if (bikeSkinID < 0 || bikeSkinID > 4) {
			console.error("Incorrect bike skin id.");
			return;
		}

		const path = this._modelsPath + onBikeFiles[bikeSkinID];

		if (this._onBike) {
			this._onBike.getChildMeshes().forEach(mesh => {
				shadowGenerator.removeShadowCaster(mesh);
				mesh.dispose();
			});
			this._onBike.dispose();
			this._onBike = undefined;
		}

		ImportMeshAsync(path, scene).then((result) => {
			const parent = new TransformNode("onBikeParent", scene);

			result.meshes.forEach(mesh => {
				mesh.parent = parent;
				shadowGenerator.addShadowCaster(mesh, true);
			});

			this._onBike = parent;
			this._onBike.setEnabled(false);

			this._onBike.scaling.set(0.5, 0.5, 0.5);

			if (this._inGame)
				this._inGame.dispose();
			this._inGame = new TransformNode("inGame", scene);
			this._onBike.parent = this._inGame;
			if (this._weapon)
				this._weapon.dispose();
			this._weapon = this.createWeapon(new Vector3(0, 0, 0), 5);
			this._weapon.parent = this._inGame;

			this._weapon.position = new Vector3(0, 1, 4);

			this._onBike.setEnabled(true);
			this._weapon.setEnabled(true);

			if (this._state !== State.ONBIKE) {
				this._inGame.setEnabled(false);
			}

			this._inGame.position = new Vector3(0, 9.5, 0);
		})
	}

	getIconPath(): string {
		if (this._profilePicture)
			return this._profilePicture;
		return (this._iconPath);
	}

	setUsername(newUsername: string): void {
		this._username = newUsername;
	}

	getUsername(): string {
		return (this._username);
	}

	getAccountID(): number {
		return (this._accountID);
	}

	getInGamePosition(): Vector3 | undefined {
		return (this._inGame?.position);
	}

	setProfilePicture(url: string): void {
		this._profilePicture = url;
	}

	destroy() {
		this.stopCurrentAnimation();
		if (this._idle) {
			shadowGenerator.removeShadowCaster(this._idle);
			this._idle.dispose();
		}
		if (this._run) {
			shadowGenerator.removeShadowCaster(this._run);
			this._run.dispose();
		}
		if (this._onBike) {
			this._onBike.getChildMeshes().forEach(mesh => {
				shadowGenerator.removeShadowCaster(mesh);
				mesh.dispose();
			});
			this._onBike.dispose();
		}
		if (this._inGame) {
			this._inGame.getChildMeshes().forEach(mesh => {
				shadowGenerator.removeShadowCaster(mesh);
				mesh.dispose();
			});
			this._inGame.dispose();
		}
		if (this._weapon) {
			shadowGenerator.removeShadowCaster(this._weapon);
			this._weapon.dispose();
		}
		this.bike.destroy();
	}

	static getIconPathBySkinId(skinId: number): string {
		if (skinId < 0 || skinId > 3)
			return "";
		return modelPath[skinId] + "Icon.png";
	}

	static createPlayerFromUser(user: User, hidden?: boolean): Player {
		const newPlayer = new Player(user.id, user.avatar, user.bike, user.username, hidden);
		newPlayer._profilePicture = user.profilePicture;
		return newPlayer;
	}
}
