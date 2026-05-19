import WebSocket, { MessageEvent } from 'ws';
import { timeStamp } from "console";
import { Player } from "./Player";
import { Ball } from "./Ball";
import { Messages } from "./Messages";
import { PowerUp , Speed, Strike, Slow} from "./PowerUp";

function lerp(start: number, end: number, factor: number): number 
{
    return start + (end - start) * factor;
}

export class Gamelogic
{
    private Players: Map<number, Player>;
    private PowerUps : Set<PowerUp> = new Set<PowerUp>();
    private Ball: Ball | undefined;
    private Intervalreturnvalue : NodeJS.Timeout | undefined = undefined;
    private IntervalreturnvaluePowerUp : NodeJS.Timeout | undefined = undefined;
    private updateScore?: () => void;
    private endGame?: (winnerId: number) => void;
    private sendPowerUpProc?: (type: string, player: number) => void;
    private resetBallCallback?: () => void;
    private powerUpsActive: boolean;
    private ballUntouchable: boolean = false;
    private readonly _ballRadius: number = 1.3;

    constructor(Players: Map<number, Player>, powerUpsActive: boolean)
    {
        this.Players = Players;
        this.powerUpsActive = powerUpsActive;

        this.Players.forEach((player) =>
        {
            this.bindPlayerSocket(player);
        });
        this.Ball = new Ball();
        if (this.Ball.callbackready)
            this.Ball.callbackready(true);
        this.Intervalreturnvalue = setInterval(()=> this.GameLogicLoop(), 50);
        if (this.powerUpsActive)
            this.IntervalreturnvaluePowerUp = setInterval(()=> this.generatePowerUp(), 10000);
    }

    public setUpdateScoreCallback(callback: () => void) {
        this.updateScore = callback;
    }

    public rebindPlayerSocket(player: Player) : void
    {
        this.bindPlayerSocket(player);
    }

    private bindPlayerSocket(player: Player) : void
    {
        player.Websocket.on('message', (data: WebSocket.Data) => {
            try
            {
                const msg = JSON.parse(data.toString());
                this.handlePlayerMsg(player, msg);
            }
            catch (error)
            {
                console.error("error parsing JSON when receiving from player", error);
            }
        });
    }

    public setEndGameCallback(callback : (winnerId: number) => void)
    {
        this.endGame = callback;
    }

    public setSendPowerUpProcCallback(callback: (type: string, player: number) => void) {
        this.sendPowerUpProc = callback;
    }

    public setResetBallCallback(callback: () => void) {
        this.resetBallCallback = callback;
    }

    private checkScore() : false | Player
    {
        for (const [key, value] of this.Players)
        {
            if (value.score >= 5)
                return (value);
        }
        return false;
    }

    private handlePlayerMsg(player : Player, msg : any)
    {
        if (msg && msg.type === "move")
        {
            player.lastmovestate = player.movestate;
            player.movestate = msg.data;
        }
    }

    private GameLogicLoop() : void
    {
        let winner : Player | false = this.checkScore();
        if (winner !== false && this.endGame)
        {
            const winnerIdnum : number = Number(winner.getId());
            this.delete();
            this.endGame(winnerIdnum);
            return;
        }
        this.updatePlayers();
        if (this.powerUpsActive)
            this.updatePowerUps();
        this.PhysicsLoop();
        this.broadcastplayers();
    }

    private updatePlayers() : void
    {
        const fieldLimit: number = 17.5;
        const moveLimit: number = fieldLimit - 0.1;

        this.Players.forEach((p) => {
            if (p.powerUpSpeedMultiplier <= 0)
                console.log("WARNING: power up speed multiplier is negative");
            if (p.movestate === "right" || p.movestate === "left")
                p.currentspeed = lerp(p.currentspeed, p.targetspeed, 0.15);
            else
                p.currentspeed = lerp(p.currentspeed, 0, 0.30);
            switch (p.movestate)
            {
                case "left":
                    if (p.pos.z === -28 && !(p.pos.x <= -moveLimit))
                        p.pos.x -= 0.8 * p.currentspeed * p.powerUpSpeedMultiplier;
                    else if (p.pos.z === 28 && !(p.pos.x >= moveLimit))
                        p.pos.x += 0.8 * p.currentspeed * p.powerUpSpeedMultiplier;
                    break;
                case "right":
                    if (p.pos.z === -28 && !(p.pos.x >= moveLimit))
                        p.pos.x += 0.8 * p.currentspeed * p.powerUpSpeedMultiplier;
                    else if (p.pos.z === 28 && !(p.pos.x <= -moveLimit))
                        p.pos.x -= 0.8 * p.currentspeed * p.powerUpSpeedMultiplier;
                    break;
                case "idle":
                    if (p.lastmovestate === "right")
                    {
                        if (p.pos.z === -28 && !(p.pos.x >= moveLimit))
                            p.pos.x += 0.8 * p.currentspeed * p.powerUpSpeedMultiplier;
                        else if (p.pos.z === 28 && !(p.pos.x <= -moveLimit))
                            p.pos.x -= 0.8 * p.currentspeed * p.powerUpSpeedMultiplier;
                    }
                    else if (p.lastmovestate === "left")
                    {
                        if (p.pos.z === -28 && !(p.pos.x <= -moveLimit))
                            p.pos.x -= 0.8 * p.currentspeed * p.powerUpSpeedMultiplier;
                        else if (p.pos.z === 28 && !(p.pos.x >= moveLimit))
                            p.pos.x += 0.8 * p.currentspeed * p.powerUpSpeedMultiplier;
                    }
                    break;
            }
            // console.log("update tick", p.getId(), "typeof:", typeof p.getId());            
            // if (p.getId() === "2")
            //     console.log("Player 2 pos is : ", p.pos.x);
            if (p.pos.x < -fieldLimit)
                p.pos.x = -fieldLimit;
            else if (p.pos.x > fieldLimit)
                p.pos.x = fieldLimit;
        });
    }

    private updatePowerUps() : void
    {
        this.PowerUps.forEach((powerup) => 
        {
            powerup.update();
            const hitPlayer : Player | undefined = powerup.checkCollision(this.Players);
            if (hitPlayer)
            {
                if (powerup instanceof Slow)
                {
                    let otherPlayer : Player | undefined;
                    this.Players.forEach((p) => {if (p !== hitPlayer) otherPlayer = p});
                    if (otherPlayer)
                        powerup.ProcEffecton(otherPlayer);
                    this.PowerUps.delete(powerup);
                }
                else if (powerup instanceof Speed) {
                    powerup.ProcEffecton(hitPlayer);
                    this.PowerUps.delete(powerup);
                }
            }
        });
        this.PowerUps.forEach((powerup) => {
            if (!powerup._isactive) {
                this.PowerUps.delete(powerup);
            }
        });
    }

    private PhysicsLoop() : void
    {
        const player1: Player | undefined = this.Players.get(1);
        const player2: Player | undefined = this.Players.get(2);
        

        if (!this.Ball || !player1 || !player2)
            return;

        const position = this.Ball.getPos();
        if (!position)
            return;

        if (this.ballUntouchable && Math.abs(position.z) < 25)
                this.ballUntouchable = false;

        if (Math.abs(position.z) >= 29.9)
        {
            if (position.z < 0)
                player2.score += 1;
            else
                player1.score += 1;
            this.resetBall();
            this.updateScore?.();
        }
        else if (position.x <= -19 || position.x >= 19)
            this.Ball.revertAngle(position, "vertical", 1);
        else if (Math.abs(position.z) >= 25 - this._ballRadius && !this.ballUntouchable)
        {
            const player = (position.z < 0) ? player1 : player2;
            const leftEdge : number = player.pos.x - 3;
            const rightEdge : number = player.pos.x + 3;
            const tolerance : number = 0.1;

            if (position.x >= leftEdge && position.x <= rightEdge)
            {
                const impactratio = ((position.x - player.pos.x) / 5);
                this.Ball.revertAngle(position, "horizontal", impactratio);
                this.Ball.speedUp();
            }
            else if (position.x >= leftEdge - this._ballRadius && position.x <= rightEdge + this._ballRadius && Math.abs(position.z) <= 25)
            {
                const nearestX = Math.max(leftEdge, Math.min(position.x, rightEdge));
                const nearestZ = Math.max(-25, Math.min(position.z, 25));

                const dx = position.x - nearestX;
                const dz = position.z - nearestZ;
                const distanceToCorner = Math.sqrt(dx * dx + dz * dz);

                if (distanceToCorner <= this._ballRadius) {
                    const impactratio = ((position.x - player.pos.x) / 5);
                    this.Ball.revertAngle(position, "horizontal", impactratio);
                    this.Ball.speedUp();
                }
            }
            else if (Math.abs(position.x - leftEdge) < tolerance || Math.abs(position.x - rightEdge) < tolerance)
            {
                this.Ball.revertAngle(position, "vertical", 1);
                this.ballUntouchable = true;
            }
        }
    }

    sendJson(message : Messages, player: WebSocket) : void
    {
        const msg = {
            type: message.getType(),
            data: message.getData(),
            timestamp: Date.now()
        };
        player.send(JSON.stringify(msg));
    }

    public gameStateFrameMsg() : any
    {
        let player1: Player | undefined = undefined;
        let player2: Player | undefined = undefined;
        // Derive player1/player2 from position (z<0 => player1, z>0 => player2) to avoid key/order issues after reconnection.
        this.Players.forEach((p) => {
            if (p.pos.z < 0)
                player1 = p;
            else
                player2 = p;
        });
        // Fallback to map keys if not found by position
        if (!player1)
            player1 = this.Players.get(1);
        if (!player2)
            player2 = this.Players.get(2);

        const ballpos: {x:number, z:number} | undefined = this.Ball?.getPos();
        const PowerUpArray : Array<{x:number, z:number, type : string}> | null = 
            this.PowerUps.size > 0 ? 
                Array.from(this.PowerUps).map((element) => ({
                    x: element.getposition().x,
                    z: element.getposition().z,
                    type: element.constructor.name
                })) 
                : null;
        if (player1 && player2 && ballpos)
        {
            const msg = 
            {
                player1 : {x: player1.pos.x, z: player1.pos.z},
                player2 : {x: player2.pos.x, z: player2.pos.z},
                ball : {x:ballpos.x, z:ballpos.z},
                powerUps :  PowerUpArray
            };
            return (msg);
        }
        return (undefined);
    }

    private broadcastplayers() : void
    {
        const msg = this.gameStateFrameMsg();
        let myMsg: Messages;
        try
        {
            myMsg = new Messages("stateframe", msg);
        }
        catch (e)
        {
            console.error("error while loading gamestateframemsg", e);
            return ;
        }
        this.Players.forEach((player) => 
        {
            // console.log("message sent with frame :", msg.player1.x, msg.player2.x, msg.ball.x, msg.ball.z )
            this.sendJson(myMsg, player.Websocket);
        });
    }

    private resetBall() : void
    {
        if (!this.Ball)
            return ;
        this.Ball.deleteInterval();
        this.Ball = undefined;
        this.PowerUps.forEach((powerUp) => {
            this.PowerUps.delete(powerUp);
        });
        this.Players.forEach((player) => {
            player.pos.x = 0;
            player.currentspeed = 0;
            player.lastmovestate = "idle";
            player.movestate = "idle";
        });
        // maybe reset power ups effects too
        this.Ball = new Ball();
        this.resetBallCallback?.();
        setTimeout(() => {
            if (this.Ball && this.Ball.callbackready)
                this.Ball.callbackready(true);
        }, 1000);
    }

    public pause() : void
    {
        if (!this.Intervalreturnvalue)
            return;
        console.log("clearingInterval");
        clearInterval(this.Intervalreturnvalue);
        this.Intervalreturnvalue = undefined;
        if (this.IntervalreturnvaluePowerUp)
        {
            console.log("clearing intervalpowerUp");
            clearInterval(this.IntervalreturnvaluePowerUp);
            this.IntervalreturnvaluePowerUp = undefined;
        }
        this.Ball?.pause();
    }

    public resume() : void
    {
        console.log("Gamelogic is resumed");
        if (this.Intervalreturnvalue !== undefined || this.IntervalreturnvaluePowerUp !== undefined)
        {
            console.log("error func resume return");    
            return;
        }
        this.Intervalreturnvalue = setInterval(()=> this.GameLogicLoop(), 50);
        if (this.powerUpsActive)
            this.IntervalreturnvaluePowerUp = setInterval(() => this.generatePowerUp(), 10000);
        this.Ball?.resume();
    }

    private generatePowerUp() : void
    {
        let randomnum : number = (Math.random() * 3) + 1;
        if (randomnum < 2)
            randomnum = 1;
        else if (randomnum < 3)
            randomnum = 2;
        else if (randomnum < 4)
            randomnum = 3;
        if (this.updateScore && this.sendPowerUpProc)
        {
            switch (randomnum)
            {
                case 1:
                    this.PowerUps.add(new Speed(this.updateScore, this.sendPowerUpProc));
                    break;
                case 2:
                    this.PowerUps.add(new Strike(this.updateScore, this.sendPowerUpProc));
                    break;
                case 3:
                    this.PowerUps.add(new Slow(this.updateScore, this.sendPowerUpProc));
                    break;
            }
        }
    }

    resetPlayersocket(newplayer: Player, newSocket: WebSocket) : void
    {
        this.Players.forEach((p, k) => {
            if (p === newplayer)
            {
                p.Websocket = newSocket;
                this.bindPlayerSocket(p);
            }
        });
    }

    delete() : void {
        clearInterval(this.Intervalreturnvalue);
        if (this.IntervalreturnvaluePowerUp !== undefined)
            clearInterval(this.IntervalreturnvaluePowerUp);
    }
}