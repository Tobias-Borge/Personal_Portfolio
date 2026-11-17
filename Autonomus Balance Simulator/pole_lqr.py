import math
import time

import gymnasium as gym

from lqr_controller import LQRController
from pole_bump import PoleBumpWrapper

DEMO_EPISODES = 5
MAX_STEPS = 50 * 50
FAIL_ANGLE_DEGREES = 90


def make_env(render_mode=None):
    env = gym.make("CartPole-v1", render_mode=render_mode, max_episode_steps=MAX_STEPS)
    env.unwrapped.theta_threshold_radians = math.radians(FAIL_ANGLE_DEGREES)
    return PoleBumpWrapper(env)


env = make_env(render_mode="human")
controller = LQRController(env)

print("\nDemo...")
for episode in range(1, DEMO_EPISODES + 1):
    state, _ = env.reset()
    done = False
    score = 0

    while not done:
        action = controller.act(state)
        state, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        score += reward
        if info.get("bumped"):
            print(f"  bump! impulse={info['impulse']:+.2f}")

    print(f"Demo episode: {episode}  Score: {score:.0f}")
    time.sleep(1)

env.close()
