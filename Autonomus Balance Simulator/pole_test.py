import math
import time

import gymnasium as gym

from dqn_agent import DQNAgent
from pole_bump import PoleBumpWrapper

TRAIN_EPISODES = 500
DEMO_EPISODES = 5
MODEL_PATH = "cartpole_dqn.keras"
LOAD_SAVED_MODEL = True
MAX_STEPS = 50 * 50
FAIL_ANGLE_DEGREES = 90


def make_env(render_mode=None):
    env = gym.make("CartPole-v1", render_mode=render_mode, max_episode_steps=MAX_STEPS)
    env.unwrapped.theta_threshold_radians = math.radians(FAIL_ANGLE_DEGREES)
    return PoleBumpWrapper(env)


env = make_env(render_mode="human")
agent = DQNAgent(env.observation_space.shape[0], env.action_space.n)
agent.model.summary()

if LOAD_SAVED_MODEL:
    agent.load(MODEL_PATH)
    env.close()
else:
    best_score = float("-inf")
    for episode in range(1, TRAIN_EPISODES + 1):
        state, _ = env.reset()
        done = False
        score = 0

        while not done:
            action = agent.act(state)
            next_state, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            agent.remember(state, action, reward, next_state, terminated)
            agent.replay()
            state = next_state
            score += reward

        print(f"Episode: {episode:3d}  Score: {score:6.0f}  Epsilon: {agent.epsilon:.3f}")
        if score > best_score:
            best_score = score
            agent.save(MODEL_PATH)

    env.close()
    print(f"Best episode score was {best_score:.0f}. Demo uses that checkpoint.")
    agent.load(MODEL_PATH)

print("\nDemo...")
agent.epsilon = 0.0
env = make_env(render_mode="human")

for episode in range(1, DEMO_EPISODES + 1):
    state, _ = env.reset()
    done = False
    score = 0

    while not done:
        action = agent.act(state)
        state, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        score += reward
        if info.get("bumped"):
            print(f"  bump! impulse={info['impulse']:+.2f}")

    print(f"Demo episode: {episode}  Score: {score:.0f}")
    time.sleep(1)

env.close()
