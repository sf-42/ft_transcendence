import {Scene, AbstractMesh, ImportMeshAsync } from '@babylonjs/core';
// import { shadowGenerator } from '../utils/babylonInit';
import { Vector3 } from '@babylonjs/core';
export class Ball
{
    private position: Vector3 = new Vector3(0, 12.25, 0);
    private _mesh: AbstractMesh | null = null;
	private _radius: number = 0.5;

    constructor(scene: Scene, isShown: boolean)
    {
        ImportMeshAsync("/assets/ball/robot-ball.obj", scene).then((result) => {
            this._mesh = result.meshes[0];
            if (!isShown)
                this._mesh.setEnabled(false);
            this._mesh.name = "ball";
            this._mesh.scaling.set(0.75, 0.75, 0.75);
            this._mesh.position = this.position;
            // shadowGenerator.addShadowCaster(this._mesh, true);
			this.calculateRadius();
        });
    }

	private calculateRadius(): void {
		if (this._mesh) {
			const boundingInfo = this._mesh.getBoundingInfo();
			const boundingBox = boundingInfo.boundingBox;

			const width = boundingBox.maximumWorld.x - boundingBox.minimumWorld.x;
			const height = boundingBox.maximumWorld.y - boundingBox.minimumWorld.y;
			const depth = boundingBox.maximumWorld.z - boundingBox.minimumWorld.z;

			this._radius = Math.max(width, height, depth) / 2;
		}
	}

    public setPosition(x:number, z:number)  : void
    {
        if (this._mesh) {
			const deltaX = x - this.position.x;
			const deltaZ = z - this.position.z;

            this._mesh.rotation.x += deltaZ / this._radius;
            this._mesh.rotation.z += -deltaX / this._radius;
        }

        this.position.x = x;
        this.position.z = z;
    }

    public resetPosition(): void
    {
        this.position.x = 0;
        this.position.z = 0;
        if (this._mesh)
            this._mesh.rotation = new Vector3(0, 0, 0);
    }

    public getMesh() : AbstractMesh | null
    {
        return (this._mesh);
    }

    public show(): void {
        this._mesh?.setEnabled(true);
    }

    public hide(): void {
        this._mesh?.setEnabled(false);
    }

    public getPosition(): Vector3 {
        return this.position;
    }

    public destroy(): void {
        this._mesh?.dispose();
    }
}
