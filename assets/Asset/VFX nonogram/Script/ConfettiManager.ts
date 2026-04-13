import {
	_decorator,
	Color,
	Component,
	GradientRange,
	ParticleSystem,
} from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ConfettiManager')
export class ConfettiManager extends Component {
	@property(ParticleSystem)
	confettiParticle: ParticleSystem[] = [];

	playWin() {
		this.confettiParticle.forEach((particle) => {
			particle.play();
		});
	}

	playLose() {
		const vfxTop = this.confettiParticle[this.confettiParticle.length - 1];
		vfxTop.startColor.mode = GradientRange.Mode.Color;
		vfxTop.startColor.color = Color.RED;
		vfxTop.play();
	}
}
