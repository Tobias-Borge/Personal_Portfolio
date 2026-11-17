import math
import os

import gymnasium as gym
import numpy as np
import pygame

from dqn_agent import DQNAgent

MODEL_PATH = "cartpole_dqn.keras"
FAIL_ANGLE_DEGREES = 90
IMPULSE = 1.0

LEFT_KEYS = (pygame.K_LEFT, pygame.K_a)
RIGHT_KEYS = (pygame.K_RIGHT, pygame.K_d)
QUIT_KEYS = (pygame.K_ESCAPE, pygame.K_q)


def make_env():
    env = gym.make("CartPole-v1", render_mode="human", max_episode_steps=-1)
    env.unwrapped.theta_threshold_radians = math.radians(FAIL_ANGLE_DEGREES)
    return env


def bump(env, direction):
    x, x_dot, theta, theta_dot = env.unwrapped.state
    impulse = IMPULSE if direction > 0 else -IMPULSE
    env.unwrapped.state = np.array(
        (x, x_dot, theta, theta_dot + impulse), dtype=np.float64
    )
    return np.array(env.unwrapped.state, dtype=np.float32), impulse


def draw_hud(env, score, episode):
    screen = env.unwrapped.screen
    if screen is None:
        return
    font = pygame.font.Font(None, 28)
    lines = [
        f"Episode {episode}   Score {int(score)}",
        "Left / A: push left     Right / D: push right",
        "Fails restart automatically     Esc / Q: quit",
    ]
    y = 8
    for line in lines:
        text = font.render(line, True, (20, 20, 20))
        screen.blit(text, (12, y))
        y += 26
    pygame.display.flip()


def read_input():
    push = 0
    quit_requested = False
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            quit_requested = True
        elif event.type == pygame.KEYDOWN:
            if event.key in QUIT_KEYS:
                quit_requested = True
            elif event.key in LEFT_KEYS:
                push = -1
            elif event.key in RIGHT_KEYS:
                push = 1
    return push, quit_requested


if not os.path.exists(MODEL_PATH):
    raise SystemExit(f"No saved model at {MODEL_PATH}. Train with pole_test.py first.")

env = make_env()
agent = DQNAgent(env.observation_space.shape[0], env.action_space.n)
agent.load(MODEL_PATH)
agent.epsilon = 0.0

print("Click the CartPole window, then push the pole with Left/Right or A/D.")
print("Close the window, Esc, or Q to quit.")

running = True
episode = 1
state, _ = env.reset()
score = 0
pygame.display.set_caption("CartPole — push Left / Right")

while running:
    action = agent.act(state)
    state, reward, terminated, truncated, _info = env.step(action)
    score += reward

    push, quit_requested = read_input()
    if quit_requested:
        running = False
        break
    if push:
        state, impulse = bump(env, push)
        print(f"  push {'right' if impulse > 0 else 'left'}  impulse={impulse:+.1f}")

    draw_hud(env, score, episode)

    if terminated or truncated:
        print(f"Episode {episode} ended  Score {int(score)}  — restarting")
        episode += 1
        state, _ = env.reset()
        score = 0

env.close()
