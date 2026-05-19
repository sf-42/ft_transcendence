import { Engine, Scene, BlurPostProcess, ShadowGenerator, Color3, Color4, DirectionalLight, Vector3, Vector2, ArcRotateCamera, MeshBuilder, StandardMaterial, Sprite, SpriteManager, CubicEase, EasingFunction, Animation } from '@babylonjs/core';

const canvas: HTMLCanvasElement = <HTMLCanvasElement>document.getElementById('renderCanvas');
export let engine: Engine;
export let scene: Scene;
export let camera: ArcRotateCamera;
export let light: DirectionalLight;
let blurPostProcess: BlurPostProcess;
export let shadowGenerator: ShadowGenerator;
const defaultTarget = new Vector3(0, 10, 0);

let cloudSpriteManager1: SpriteManager | null = null, cloudSpriteManager2: SpriteManager | null = null;
let cloudSprite1: Sprite | null = null, cloudSprite2: Sprite | null = null;
let cloudInterval1: NodeJS.Timeout | null = null, cloudInterval2: NodeJS.Timeout | null = null;
let pos = 5;
let pos2 = 6;

export function babylonInit(): void {
	if (canvas) {
		engine = new Engine(canvas, true);

		const createScene = function () {
			const scene = new Scene(engine);

			scene.clearColor = new Color4(0.6039215686274509, 0.792156862745098, 0.95, 1);

			light = new DirectionalLight("dirLight", new Vector3(0, -1, -1), scene);
			light.position = new Vector3(0, 20, 5);
			camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.07, 10, defaultTarget, scene);

			// camera.attachControl();

			shadowGenerator = new ShadowGenerator(1024, light);
			shadowGenerator.useBlurExponentialShadowMap = true;
			shadowGenerator.useKernelBlur = true;
			shadowGenerator.blurKernel = 64;

			const ground = MeshBuilder.CreateGroundFromHeightMap("ground", './assets/heightmap_crater_pixelated.png',
				{
					width: 400,
					height: 400,
					subdivisions: 1024,
					minHeight: -1,
					maxHeight: 20
				}, scene);

			ground.position.y = 10;

			const groundMaterial = new StandardMaterial('MyGroundMaterial');
			ground.material = groundMaterial;

			groundMaterial.specularColor = new Color3(0, 0, 0);
			groundMaterial.ambientColor = new Color3(1, 1, 1);
			groundMaterial.diffuseColor = new Color3(0.7568627450980392, 0.4, 0.18823529411764706);

			ground.receiveShadows = true;

			blurPostProcess = new BlurPostProcess(
				"blur",
				new Vector2(1, 1), // blur direction (1,1 for both X and Y)
				128, // blur kernel size (higher = more blur)
				1.0, // sampling ratio
				camera
			);

			return (scene);
		}

		scene = createScene();

		engine.runRenderLoop(function () {
			scene.render();
		});

		window.addEventListener('resize', function () {
			engine.resize();
		});

		window.addEventListener("keydown", (e) => {
			if (e.shiftKey && e.altKey && e.ctrlKey && e.key.toLowerCase() === "i") {
				scene.debugLayer.isVisible() ? scene.debugLayer.hide() : scene.debugLayer.show();
			}
		});

		renderClouds(scene);
	}
	else {
		console.error('Could not get canvas');
	}
}

let blurTarget = 0;
let blurAnimating = false;

export function toggleBlur(enable: boolean): void {
	if (!blurPostProcess)
		return;

	blurTarget = enable ? 50 : 0;
	if (!blurAnimating)
		animateBlur();
}

function animateBlur() {
	blurAnimating = true;
	const speed = 4;

	function step() {
		if (!blurPostProcess)
			return;
		let current = blurPostProcess.kernel;
		if (Math.abs(current - blurTarget) < 0.5) {
			blurPostProcess.kernel = blurTarget;
			blurAnimating = false;
			return;
		}
		blurPostProcess.kernel += (blurTarget - current) * 0.1 + (blurTarget > current ? speed : -speed);
		requestAnimationFrame(step);
	}
	step();
}

function renderClouds(scene: Scene): void {
	if (cloudSprite1 && cloudSprite2)
		return;

	if (!cloudSpriteManager1)
		cloudSpriteManager1 = new SpriteManager('cloudManager1', '/assets/cloud1sprite.png', 3, 64, scene);

	if (!cloudSpriteManager2)
		cloudSpriteManager2 = new SpriteManager('cloudManager2', '/assets/cloud2sprite.png', 3, 64, scene);

	if (!cloudSprite1) {
		cloudSprite1 = new Sprite('cloud1', cloudSpriteManager1);
		cloudSprite1.position.y = 13.5;
		cloudSprite1.width = 1.2;
		cloudSprite1.height = 1.2;
		cloudSprite1.playAnimation(0, 4, true, 200);
	}

	if (!cloudSprite2) {
		cloudSprite2 = new Sprite('cloud2', cloudSpriteManager2);
		cloudSprite2.position.y = 13;
		cloudSprite2.width = 1.2;
		cloudSprite2.height = 1.2;
		cloudSprite2.playAnimation(0, 3, true, 200);
	}

	if (!cloudInterval1) {
		cloudInterval1 = setInterval(function (cloudSprite: Sprite) {
			if (cloudSprite && cloudSprite.isVisible) {
				pos -= 0.001;
				cloudSprite.position.x = pos;
				if (pos < -9)
					pos = 9;
			}
		}, 8, cloudSprite1);
	}

	if (!cloudInterval2) {
		cloudInterval2 = setInterval(function (cloudSprite) {
			if (cloudSprite && cloudSprite.isVisible) {
				pos2 -= 0.001;
				cloudSprite.position.x = pos2;
				if (pos2 < -9)
					pos2 = 9;
			}
		}, 16, cloudSprite2);
	}
}

export function hideClouds(): void {
	if (cloudSprite1)
		cloudSprite1.isVisible = false;
	if (cloudSprite2)
		cloudSprite2.isVisible = false;
}

export function showClouds(): void {
	if (cloudSprite1)
		cloudSprite1.isVisible = true;
	if (cloudSprite2)
		cloudSprite2.isVisible = true;

	if (!cloudInterval1 && cloudSprite1) {
		cloudInterval1 = setInterval(function (cloudSprite: Sprite) {
			if (cloudSprite && cloudSprite.isVisible) {
				pos -= 0.001;
				cloudSprite.position.x = pos;
				if (pos < -9)
					pos = 9;
			}
		}, 8, cloudSprite1);
	}

	if (!cloudInterval2 && cloudSprite2) {
		cloudInterval2 = setInterval(function (cloudSprite: Sprite) {
			if (cloudSprite && cloudSprite.isVisible) {
				pos -= 0.001;
				cloudSprite.position.x = pos;
				if (pos < -9)
					pos = 9;
			}
		}, 16, cloudSprite2);
	}
}

/* // Add cleanup function for when you need to completely dispose
function disposeClouds(): void {
	if (cloudInterval1) {
		clearInterval(cloudInterval1);
		cloudInterval1 = null;
	}
	if (cloudInterval2) {
		clearInterval(cloudInterval2);
		cloudInterval2 = null;
	}
	if (cloudSprite1) {
		cloudSprite1.dispose();
		cloudSprite1 = null;
	}
	if (cloudSprite2) {
		cloudSprite2.dispose();
		cloudSprite2 = null;
	}
	if (cloudSpriteManager1) {
		cloudSpriteManager1.dispose();
		cloudSpriteManager1 = null;
	}
	if (cloudSpriteManager2) {
		cloudSpriteManager2.dispose();
		cloudSpriteManager2 = null;
	}
} */

export function moveCamera(alpha: number, beta: number, radius: number, duration: number, target?: Vector3): void {
	const fps = 60;
	const frames = duration / 1000 * fps;

	const easingFunction = new CubicEase();
	easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

	const alphaAnimation = new Animation(
		"cameraAlpha",
		"alpha", 
		fps,
		Animation.ANIMATIONTYPE_FLOAT,
		Animation.ANIMATIONLOOPMODE_CONSTANT
	);
	alphaAnimation.setKeys([
		{frame: 0, value: camera.alpha},
		{frame: frames, value: alpha}
	]);
	alphaAnimation.setEasingFunction(easingFunction);

	const betaAnimation = new Animation(
		"cameraBeta",
		"beta", 
		fps,
		Animation.ANIMATIONTYPE_FLOAT,
		Animation.ANIMATIONLOOPMODE_CONSTANT
	);
	betaAnimation.setKeys([
		{frame: 0, value: camera.beta},
		{frame: frames, value: beta}
	]);
	betaAnimation.setEasingFunction(easingFunction);

	const radiusAnimation = new Animation(
		"cameraRadius",
		"radius", 
		fps,
		Animation.ANIMATIONTYPE_FLOAT,
		Animation.ANIMATIONLOOPMODE_CONSTANT
	);
	radiusAnimation.setKeys([
		{frame: 0, value: camera.radius},
		{frame: frames, value: radius}
	]);
	radiusAnimation.setEasingFunction(easingFunction);

	const animations = [alphaAnimation, betaAnimation, radiusAnimation];

	if (target) {
		const targetAnimation = new Animation(
			"cameraTarget",
			"target",
			fps,
			Animation.ANIMATIONTYPE_VECTOR3,
			Animation.ANIMATIONLOOPMODE_CONSTANT
		);
		targetAnimation.setKeys([
			{frame: 0, value: camera.target},
			{frame: frames, value: target}
		]);
		targetAnimation.setEasingFunction(easingFunction);
		animations.push(targetAnimation);
	}

	scene.beginDirectAnimation(camera, animations, 0, frames, false);
}

function calculateRadius(width: number): number {
	if (width < 700)
		return (100 - (width - 500) * 15 / 200);
	return (85 - (width - 700) * 25 / 1220);
}

export function setGameCamera(player: number): void {
	const alpha = player === 1 ? -1.5758 : 1.5758;
	const radius = Math.max(60, calculateRadius(window.innerWidth));
	moveCamera(alpha, 1.285, radius, 500, new Vector3(0, 9.5, 0));
}

export function updateCameraRadius(): void {
	camera.radius = Math.max(60, calculateRadius(window.innerWidth));
}

export function resetCameraAndLight(): void {
	window.removeEventListener('resize', updateCameraRadius);
	moveCamera(Math.PI / 2, Math.PI / 2.07, 10, 500, defaultTarget);
	light.position = new Vector3(0, 20, 5);
	light.direction = new Vector3(0, -1, -1);
}