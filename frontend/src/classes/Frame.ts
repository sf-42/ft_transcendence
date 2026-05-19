export class Frame {
	private timestamp: number;
	private player1pos: { x: number, z: number };
	private player2pos: { x: number, z: number };
	private ballpos: { x: number, z: number };
	private ballreset: boolean = false;
	private powerups: Array<{x: number, z: number, type: string}> | null;

	constructor(player1pos: { x: number, z: number }, player2pos: { x: number, z: number }, ball: { x: number, z: number }, powerups: Array<{x: number, z: number, type: string}> | null) 
	{
		this.timestamp = Date.now();
		this.player1pos = player1pos;
		this.player2pos = player2pos;
		this.ballpos = ball;
		this.powerups = powerups;
		if (ball.x === 0 && ball.z === 0)
			this.ballreset = true;
	}
	
	getBallpos(): { x: number, z: number } {
		return this.ballpos;
	}

	getPlayer1pos(): { x: number, z: number } {
		return this.player1pos;
	}

	getPlayer2pos(): { x: number, z: number } {
		return this.player2pos;
	}

	getTimeStamp(): number {
		return this.timestamp;
	}

	getPowerUps(): Array<{x: number, z: number, type: string}> | null
	{
		return this.powerups;
	}

	isBallReset(): boolean {
		return this.ballreset;
	}
}
