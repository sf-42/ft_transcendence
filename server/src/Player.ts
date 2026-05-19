import WebSocket from "ws";

export class Player 
{
    private readonly id: string;
    public pos: {x:number, z:number};
    public isConnected: boolean;
    public Websocket : WebSocket;
    public movestate : "left" | "right" | "idle" = "idle";
    public lastmovestate : "left" | "right" | "idle" = "idle";
    public score : number = 0;
    public ready : boolean = false;
    public currentspeed : number = 1;
    public targetspeed : number = 1.5;
    public powerUpSpeedMultiplier : number = 1;

    constructor (userid: string, firstpos: {x: number, z: number}, Websocket : WebSocket)
    {
        this.Websocket = Websocket;
        this.id = userid;
        this.isConnected = true;
        this.pos = firstpos;
    }

    public getId() : string
    {
        return (this.id);
    }
}