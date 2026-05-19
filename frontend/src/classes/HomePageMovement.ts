import { Observer, Scene } from "@babylonjs/core";
import { Player } from "./Player";
import { binds } from "../main";

export class HomePageMovement {
	private _vx: number = 0;
	private readonly _accel: number = 0.005;
	private readonly _maxSpeed: number = 0.01;
	private readonly _friction: number = 0.02;
	private readonly _keys: Record<string, boolean> = {};
	private _observer: Observer<Scene> | null = null;
	private _isInitialized: boolean = false;
	private static _instance: HomePageMovement | null = null;

	private keydownHandler = (e: KeyboardEvent) => {
		this._keys[e.key.toLowerCase()] = true;
	}

	private keyupHandler = (e: KeyboardEvent) => {
		this._keys[e.key.toLowerCase()] = false;
	}

	constructor(
		private _scene: Scene,
		private _player: Player
	) {}

	static getInstance(scene: Scene, player: Player): HomePageMovement {
		if (!HomePageMovement._instance)
			HomePageMovement._instance = new HomePageMovement(scene, player);
		else {
			HomePageMovement._instance._scene = scene;
			HomePageMovement._instance._player = player;
		}
		return (HomePageMovement._instance);
	}

	initialize(): void {
		if (this._isInitialized)
			return;

		window.addEventListener("keydown", this.keydownHandler);
		window.addEventListener("keyup", this.keyupHandler);

		this._observer = this._scene.onBeforeRenderObservable.add(() => {
			this.updateMovement();
		});
		this._isInitialized = true;
	}

	cleanup(): void {
		if (!this._isInitialized)
			return;

		window.removeEventListener("keydown", this.keydownHandler);
		window.removeEventListener("keyup", this.keyupHandler);

		if (this._observer !== null) {
			this._scene.onBeforeRenderObservable.remove(this._observer);
			this._observer = null;
		}
		this._isInitialized = false;
		HomePageMovement._instance = null;
	}

	isInitialized(): boolean {
		return (this._isInitialized);
	}

	private updateMovement(): void {
		if (!this._isInitialized)
			return;
		
		if (this._keys[binds.left]) {
			this._vx = Math.max(this._vx + this._accel, this._maxSpeed);
			this._player.faceLeft();
		}
		else if (this._keys[binds.right]) {
			this._vx = Math.min(this._vx - this._accel, -this._maxSpeed);
			this._player.faceRight();
		}
		else {
			// Decelerate X
			if (this._vx > 0)
				this._vx = Math.max(0, this._vx - this._friction);
			if (this._vx < 0)
				this._vx = Math.min(0, this._vx + this._friction);
		}

		// Update player position
		if (this._player) {
			let pos = this._player.getPosition();

			if (pos) {
				if (Math.abs(pos.x + this._vx) < 6)
					this._player.moveXPosition(this._vx);
			}

			// Switch animation based on movement
			if (Math.abs(this._vx) > 0.01) {
				if (this._player.getState() === "idle")
					this._player.setState("run");
			} else {
				if (this._player.getState() === "run")
					this._player.setState("idle");
			}
		}
	}
}