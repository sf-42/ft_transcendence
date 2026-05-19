import {Scene, MeshBuilder, Mesh, StandardMaterial, Color3 } from '@babylonjs/core';
import { Vector3 } from '@babylonjs/core';

export abstract class PowerUp 
{
    protected _position : Vector3;
    public  _isactive: boolean = true;

    constructor(x:number, z : number)
    {
        this._position =  new Vector3(x, 12, z);;
    }

    public setPosition(x: number, z: number) : void
    {
        this._position.x = x;
        this._position.z = z;
    }

    public getPositionx() : number
    {
        return (this._position.x);
    }

    public getPositionz() : number
    {
        return (this._position.z);
    } 

    public destroy() : void
    {
        this._isactive = false;
    }

}


export class Speed extends PowerUp
{
    private _mesh : Mesh;

    constructor(x: number, z: number, scene: Scene)
    {
        super(x, z);
        this._mesh = MeshBuilder.CreateSphere("speed", {diameter: 0.5}, scene);
        this._mesh.position = this._position;

        const material = new StandardMaterial("speed material", scene);
        material.diffuseColor = new Color3(1, 1, 0);
        material.alpha = 0.7;
        this._mesh.material = material;
    }

    public destroy() : void
    {
        super.destroy();
        this._mesh.dispose();
    }
   
}

export class Strike extends PowerUp
{
    private _mesh : Mesh;
    
    constructor(x: number, z: number, scene: Scene)
    {
        super(x, z);
        this._mesh = MeshBuilder.CreateSphere("strike", {diameter: 0.5}, scene);
        this._mesh.position = this._position;

        const material = new StandardMaterial("strike material", scene);
        material.diffuseColor = new Color3(1, 0, 0);
        material.alpha = 0.7;
        this._mesh.material = material;
    }

    public destroy() : void
    {
        super.destroy();
        this._mesh.dispose();
    }
}

export class Slow extends PowerUp
{
    private _mesh : Mesh;

    constructor(x: number, z: number, scene: Scene)
    {
        super(x, z);
        this._mesh = MeshBuilder.CreateSphere("slow", {diameter: 0.5}, scene);
        this._mesh.position = this._position;

        const material = new StandardMaterial("slow material", scene);
        material.diffuseColor = new Color3(0.8, 0, 1);
        material.alpha = 0.7;
        this._mesh.material = material;
    }

    public destroy() : void
    {
        super.destroy();
        this._mesh.dispose();
    }
}