import { Scene, ActionManager, ExecuteCodeAction, Observer, Scalar } from '@babylonjs/core';
import { MyWebSocket } from './Network';
import { binds } from '../main';

enum MovementState { IDLE = 'idle', LEFT = 'left', RIGHT = 'right' }

interface MobileInputs {
	left: boolean,
	right: boolean
}

export const mobileInputs: MobileInputs = {
	left: false,
	right: false
}

export class PlayerInput {
	private _scene: Scene;
	private _webSocket: MyWebSocket;
	inputMap: any;
	private keydownHandler : (e: KeyboardEvent) => void;
	private keyupHandler : (e: KeyboardEvent) => void;
	private _currentMovementState: MovementState = MovementState.IDLE;
	private _previousMovementState: MovementState = MovementState.IDLE;

	constructor(scene: Scene, webSocket: MyWebSocket) {
		this._scene = scene;
		this.inputMap = {};
		this._webSocket = webSocket;
		// Initialize ActionManager if it doesn't exist
		this.keydownHandler = (e: KeyboardEvent) => { this.inputMap[e.key] = true; };
    	this.keyupHandler = (e: KeyboardEvent) => { this.inputMap[e.key] = false; };
    	window.addEventListener('keydown', this.keydownHandler);
    	window.addEventListener('keyup', this.keyupHandler);
		this._scene.onBeforeRenderObservable.add(() => {
			this._updateFromKeyBoard();
		});
	}

	private _updateFromKeyBoard(): void {
		this._previousMovementState = this._currentMovementState;
		// setting current MovementState
		if (this.inputMap[binds.left] || mobileInputs.left) {
			this._currentMovementState = MovementState.LEFT;
		}
		else if (this.inputMap[binds.right] || mobileInputs.right) {
			this._currentMovementState = MovementState.RIGHT;
		}
		else {
			this._currentMovementState = MovementState.IDLE;
		}
		if (this._previousMovementState !== this._currentMovementState) {
			this._onstateChange(this._currentMovementState);
		}
	}
	
	private _onstateChange(currentstate: MovementState) {
		this._webSocket.sendToJson("move", currentstate);
	}

	public destroy()
	{
		window.removeEventListener('keydown', this.keydownHandler);
		window.removeEventListener('keyup', this.keyupHandler);
	}
}