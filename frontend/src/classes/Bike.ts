import { AbstractMesh, Animation, ImportMeshAsync, Axis, Vector3 } from '@babylonjs/core';
import "@babylonjs/loaders";
import { scene, shadowGenerator } from "../utils/babylonInit.ts";

enum BikeState { IDLE = "idle", HIDDEN = "hidden"}

const bikeModelPath = [
	"/assets/bikes/Chopper/Chopper-0-Chopper.obj",
	"/assets/bikes/Cross/Cross-0-Cross.obj",
	"/assets/bikes/GunBike/GunBike-0-GunBike.obj",
	"/assets/bikes/Scooter/Scooter-0-Scooter.obj",
	"/assets/bikes/Tracer/Tracer-0-Tracer.obj"
]

export class Bike {
    private _skinID: number;
	private _mesh?: AbstractMesh;
	private _idle = new Animation(
		"idle",
		"position.y",
		60,
		Animation.ANIMATIONTYPE_FLOAT,
		Animation.ANIMATIONLOOPMODE_CYCLE
	);
	private _idleKeys = [
		{ frame: 0, value: 10.4 },
		{ frame: 30, value: 10.5 },
		{ frame: 60, value: 10.4 }
	];
	private _state: BikeState;

    constructor(id: number) {
		this._state = BikeState.HIDDEN;
		this._idle.setKeys(this._idleKeys);
		
		if (id < 0 || id > 4)
			id = 4

		this._skinID = id;

		const meshPath = bikeModelPath[id];

		ImportMeshAsync(meshPath, scene).then((result) => {
            this._mesh = result.meshes[0];
			this._mesh.setEnabled(false);
			this._mesh.visibility = 0;
            this._mesh.position = new Vector3(-6, 10.2, -2);
			this._mesh.scaling.set(0.5, 0.5, 0.5);
			if (id === 1)
				this._mesh.rotate(Axis.Y, -3 * Math.PI / 4);
			else
				this._mesh.rotate(Axis.Y, Math.PI / 4);
			this.setState("idle");
			shadowGenerator.addShadowCaster(this._mesh, true);
			if (this._state !== BikeState.HIDDEN)
				this.show();
        });
    }

	getID(): number {
		return (this._skinID);
	}

	setPosition(x: number, y: number, z: number) {
		if (this._mesh)
			this._mesh.position.set(x, y, z);
	}

	async changeSkin(id: number): Promise<boolean> {
		if (id === this._skinID)
			return (false);

		if (id < 0 || id > 4) {
			console.error("Invalid bike skin id.");
			return (false);
		}
		
		const meshPath = bikeModelPath[id];
		
		let pos: AbstractMesh["position"];
		let scale: AbstractMesh["scaling"];
		let prevState = this._state;
		this._skinID = id;

		if (this._mesh) {
			pos = this._mesh.position;
			scale = this._mesh.scaling;
			shadowGenerator.removeShadowCaster(this._mesh);
			this._mesh.dispose();
		}
		
		ImportMeshAsync(meshPath, scene).then((result) => {
			this._mesh = result.meshes[0];
			this._mesh.setEnabled(false);
			this._mesh.visibility = 0;
			this._mesh.position = pos;
			this._mesh.scaling = scale;
			if (id === 1)
				this._mesh.rotate(Axis.Y, -3 * Math.PI / 4);
			else
				this._mesh.rotate(Axis.Y, Math.PI / 4);
			this._state = BikeState.HIDDEN;
			this.setState(prevState);
			if (this._state !== BikeState.HIDDEN)
				this.show();
			shadowGenerator.addShadowCaster(this._mesh, true);
		});
		return (true);
	}

	setState(state: string): void {
		if (state === this._state || !this._mesh)
			return;

		if (state === "idle") {
			this._state = BikeState.IDLE;
			this._mesh.animations = [this._idle];
			this.show();
			scene.beginAnimation(this._mesh, 0, 60, true);
		}
		else if (state === BikeState.HIDDEN) {
			this._state = BikeState.HIDDEN;
			scene.stopAnimation(this._mesh);
			this.hide();
		}
	}

	getState(): string {
		return (this._state);
	}

	hide(): void {
		if (this._mesh) {
			this._mesh.setEnabled(false);
			this._mesh.visibility = 0;
		}
	}

	show(): void {
		if (this._mesh) {
			this._mesh.setEnabled(true);
			this._mesh.visibility = 1;
		}
	}

	destroy() {
		if (this._mesh)
			this._mesh.dispose();
	}
}