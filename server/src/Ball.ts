import { timeStamp } from "console";

export class Ball
{
    private position : {x:number, z:number};
    private angle: number = 0;
    private movespeed: number;
    private ready: boolean = false;
    public callbackready?: (ready:boolean) => void;
    private IntervalballLoop? : NodeJS.Timeout | undefined = undefined;
    readonly maxSpeed: number = 2.5;


    constructor()
    {
        this.position = {x:0, z:0};
        this.angle = Ball.generateAngle();
        this.movespeed = 1;
        this.waitingReadystate().then(()=> {this.IntervalballLoop = setInterval(() => this.ballLoop(), 50);});
    }

    private ballLoop() : void
    {
        this.position.x += Math.cos(this.angle) * this.movespeed;
        this.position.z += Math.sin(this.angle) * this.movespeed;
    }

    private async waitingReadystate(): Promise<void>
    {
        return new Promise((resolve) => {
            this.callbackready = (ready:boolean) => {
            this.ready = ready;
            resolve();
        }
        });
    }

    public static generateAngle() : number
    {
        let angle: number;
        angle = Math.random() * 2 * Math.PI;
        const tolerance = Math.PI / 6;
        if ((angle >= Math.PI - tolerance && angle <= Math.PI + tolerance) || angle <= tolerance || angle >= 2 * Math.PI - tolerance)
            return this.generateAngle();
        else
            return angle;
    }

    public getPos() : {x: number, z:number}
    {
        return this.position;
    }

    public setAngle(angle:number) : void
    {
        this.angle = angle;
    }

    public getAngle() : number
    {
        return this.angle;
    }

    public deleteInterval() : void
    {
        clearInterval(this.IntervalballLoop);
    }

    public revertAngle(position: {x:number, z:number}, face : string, angleratio: number)
    {
        const maxDeviation = Math.PI / 4; // 45°
        if (face === "vertical")
        {
            this.angle = Math.PI - this.angle;
        }
        else if (face === "horizontal")
        {
            if (position.z < 0)
                this.angle = Math.PI / 2 - angleratio * Math.PI / 4;
            else
                this.angle = -Math.PI / 2 + angleratio * Math.PI / 4;
        }
        if (this.angle > Math.PI) this.angle -= 2 * Math.PI;
        if (this.angle < -Math.PI) this.angle += 2 * Math.PI;
    }

    public speedUp(): void {
        if (this.movespeed < this.maxSpeed) {
            this.movespeed += 0.1;
        }
    }

    public pause() : void
    {
        if (this.IntervalballLoop !== undefined)
        {
            clearInterval(this.IntervalballLoop);
            this.IntervalballLoop = undefined;
        }
    }

    public resume() : void
    {
        if (this.IntervalballLoop === undefined)
            this.IntervalballLoop = setInterval(() => this.ballLoop(), 50);
    }

    public reset()
    {
        this.position.x = 0;
        this.position.z = 0;
    }
}