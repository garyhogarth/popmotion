import { number } from 'style-value-types';
import action, { Action } from '../../action';
import vectorAction, { ActionFactory } from '../../action/vector';
import value from '../../reactions/value';
import spring from '../spring';
import decay from '../decay';
import { ColdSubscription } from '../../action/types';
import { Props, SpringProps } from './types';

const inertia = ({
  from = 0,
  velocity = 0,
  min,
  max,
  power = 0.8,
  timeConstant = 700,
  bounceStiffness = 500,
  bounceDamping = 10,
  restDelta = 1,
  modifyTarget
}: Props) =>
  action(({ update, complete }) => {
    const current = value(from);
    let activeAnimation: ColdSubscription;
    let isSpring = false;

    const isLessThanMin = (v: number) => min !== undefined && v <= min;
    const isMoreThanMax = (v: number) => max !== undefined && v >= max;
    const isOutOfBounds = (v: number) => isLessThanMin(v) || isMoreThanMax(v);
    const isTravellingAwayFromBounds = (v: number, currentVelocity: number) => {
      return (
        (isLessThanMin(v) && currentVelocity < 0) ||
        (isMoreThanMax(v) && currentVelocity > 0)
      );
    };

    const startAnimation = (animation: Action, onComplete?: Function) => {
      activeAnimation && activeAnimation.stop();

      activeAnimation = animation.start({
        update: (v: number) => current.update(v),
        complete: () => {
          complete();
          onComplete && onComplete();
        }
      });
    };

    const startSpring = (props: SpringProps) => {
      isSpring = true;
      startAnimation(
        spring({
          ...props,
          to: isLessThanMin(props.from) ? min : max,
          stiffness: bounceStiffness,
          damping: bounceDamping,
          restDelta
        })
      );
    };

    current.subscribe((v: number) => {
      update(v);

      const currentVelocity = current.getVelocity();

      // Snap to the nearest boundary if we're not already in a spring state and
      // our value is moving away from the bounded area.
      if (
        activeAnimation &&
        !isSpring &&
        isTravellingAwayFromBounds(v, currentVelocity)
      ) {
        startSpring({ from: v, velocity: currentVelocity });
      }
    });

    // We want to start the animation already as a spring if we're moving away from the bounded area
    // or not moving at all.
    if (
      (isOutOfBounds(from) && velocity === 0) ||
      isTravellingAwayFromBounds(from, velocity)
    ) {
      startSpring({ from, velocity });

      // Otherwise we want to simulate inertial movement with decay
    } else if (velocity !== 0) {
      const animation = decay({
        from,
        velocity,
        timeConstant,
        power,
        restDelta: isOutOfBounds(from) ? 20 : restDelta,
        modifyTarget
      });

      startAnimation(animation, () => {
        const v = current.get() as number;

        if (isOutOfBounds(v)) {
          startSpring({ from: v, velocity: current.getVelocity() });
        }
      });
    } else {
      complete();
    }

    return {
      stop: () => activeAnimation && activeAnimation.stop()
    };
  });

export default vectorAction(inertia, {
  from: number.test,
  velocity: number.test,
  min: number.test,
  max: number.test,
  damping: number.test,
  stiffness: number.test,
  modifyTarget: (func: any) => typeof func === 'function'
}) as ActionFactory;
