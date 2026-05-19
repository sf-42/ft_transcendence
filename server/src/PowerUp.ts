import { Player } from "./Player";
import { Ball } from "./Ball";

export abstract class PowerUp 
{
    private _position : {x:number , z :number} = {x:0, z:0};
    private _angle: number = 0;
    private _movespeed: number = 0;
    public  _isactive: boolean = true;
    public  _updateScore: () => void; 
    public  _sendToClient: (type: string, player: number) => void;

    constructor(position: {x:number, z : number}, angle: number, movespeed: number, scoreCallback: () => void, sendToClientCallback: (type: string, player: number) => void)
    {
        this._position = position;
        this._angle = angle;
        this._movespeed = movespeed;
        this._updateScore = scoreCallback;
        this._sendToClient = sendToClientCallback;
    }

    public static generateRandomposX() : number
    {
        const num = Math.random() * 36 - 18;
        // if (num === -20 || num === 20)
        //     return PowerUp.generateRandomposX();
        return num;
    }

    public getposition() : {x: number, z: number}
    {
        return (this._position);
    }

    public update() : boolean
    {
        if (!this._isactive)
            return false;
        this._position.x += Math.cos(this._angle) * this._movespeed;
        this._position.z += Math.sin(this._angle) * this._movespeed;
        return true;
        // ici on fait le set interval pour la boucle de mouvement et de check hitbox
    }

    public checkCollision(Players : Map<number, Player>) : Player | undefined
    {
        const player1: Player | undefined = Players.get(1);
        const player2: Player | undefined = Players.get(2);
        if (!player1 || !player2)
            return undefined;
        
        if (this._position.z <= -29.9 || this._position.z >= 29.9)
            {
                if (this instanceof Strike)
                    {
                        if (this._position.z < 0)
                            player2.score += 1;
                else
                    player1.score += 1;
                this._updateScore();
            }
            this.destroy();
            return undefined;
        }
        else if (this._position.x <= -19.9 || this._position.x >= 19.9)
            this.revertAngle(this._position, "vertical", 1);
        else if (Math.abs(this._position.z) >= 25) {
            const hitPlayer = (this._position.z < 0) ? player1 : player2;
            const leftEdge: number = hitPlayer.pos.x - 2.5;
            const rightEdge: number = hitPlayer.pos.x + 2.5;
            const tolerance: number = 0.1;

            if (Math.abs(this._position.x - leftEdge) < tolerance || Math.abs(this._position.x - rightEdge) < tolerance)
            {
                this.revertAngle(this._position, "vertical", 1);
                return hitPlayer;
            } 
            else if (this._position.x >= leftEdge && this._position.x <= rightEdge)
            {
                if (this instanceof Strike)
                {
                    const impactratio = ((this._position.x - hitPlayer.pos.x) / 5);
                    const angleratio = impactratio;
                    this.revertAngle(this._position, "horizontal", angleratio);
                    return hitPlayer;
                }
                return hitPlayer;
            }
        }
    }

    public destroy() : void
    {
        this._isactive = false;
    }

    public revertAngle(position: {x:number, z:number}, face : string, angleratio: number)
    {
        const maxDeviation = Math.PI / 4; // 45°
        if (face === "vertical")
        {
            this._angle = Math.PI - this._angle;
        }
        else if (face === "horizontal")
        {
            if (position.z < 0)
                this._angle = Math.PI / 2 - angleratio * Math.PI / 4;
            else
                this._angle = -Math.PI / 2 + angleratio * Math.PI / 4;
        }
        if (this._angle > Math.PI) this._angle -= 2 * Math.PI;
        if (this._angle < -Math.PI) this._angle += 2 * Math.PI;
    }

    public abstract ProcEffecton(player: Player): void;
}


export class Speed extends PowerUp
{
    constructor(scoreCallback: () => void, sendToClientCallback: (type: string, player: number) => void)
    {
        super({x: PowerUp.generateRandomposX(), z: 0}, Ball.generateAngle(), 1, scoreCallback, sendToClientCallback);
    }

    public ProcEffecton(player: Player) : void
    {
        player.powerUpSpeedMultiplier += 1;
        this._sendToClient("speed", player.pos.z > 0 ? 2 : 1);
        setTimeout(() => {player.powerUpSpeedMultiplier -= 1}, 10000);
    }
}

export class Strike extends PowerUp
{
    constructor(scoreCallback: () => void, sendToClientCallback: (type: string, player: number) => void)
    {
        super({x: PowerUp.generateRandomposX(), z: 0}, Ball.generateAngle(), 1, scoreCallback, sendToClientCallback);
    }


    // useless but needed for typescript convenience
    public ProcEffecton(player: Player) : void
    {
        return;
    }
}

export class Slow extends PowerUp
{
     constructor(scoreCallback: () => void, sendToClientCallback: (type: string, player: number) => void)
    {
        super({x: PowerUp.generateRandomposX(), z: 0}, Ball.generateAngle(), 1, scoreCallback, sendToClientCallback);
    }


    public ProcEffecton(player: Player) : void
    {
        player.powerUpSpeedMultiplier -= 0.5;
        if (player.powerUpSpeedMultiplier < 0.1)
            player.powerUpSpeedMultiplier = 0.1;
        this._sendToClient("slow", player.pos.z > 0 ? 2 : 1);
        setTimeout(() => { player.powerUpSpeedMultiplier += 0.5 }, 5000);
    }
}