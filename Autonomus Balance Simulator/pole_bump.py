import math

import gymnasium as gym
import numpy as np


class PoleBumpWrapper(gym.Wrapper):
    """Bump the pole after it has been stable for settle_steps."""

    def __init__(self, env, impulse=1.0, settle_steps=20, warmup_steps=40):
        super().__init__(env)
        self.impulse = impulse
        self.settle_steps = settle_steps
        self.warmup_steps = warmup_steps
        self.settle_angle = math.radians(6.0)
        self._step_count = 0
        self._settled_steps = 0

    def reset(self, **kwargs):
        self._step_count = 0
        self._settled_steps = 0
        return self.env.reset(**kwargs)

    def step(self, action):
        obs, reward, terminated, truncated, info = self.env.step(action)
        self._step_count += 1
        info["bumped"] = False

        if terminated or truncated or self._step_count <= self.warmup_steps:
            self._settled_steps = 0
            return obs, reward, terminated, truncated, info

        _, _, theta, theta_dot = self.unwrapped.state
        settled = abs(float(theta)) < self.settle_angle and abs(float(theta_dot)) < 0.8
        if not settled:
            self._settled_steps = 0
            return obs, reward, terminated, truncated, info

        self._settled_steps += 1
        if self._settled_steps >= self.settle_steps:
            x, x_dot, theta, theta_dot = self.unwrapped.state
            impulse = self.impulse
            if self.unwrapped.np_random.random() < 0.5:
                impulse = -impulse
            self.unwrapped.state = np.array(
                (x, x_dot, theta, theta_dot + impulse), dtype=np.float64
            )
            obs = np.array(self.unwrapped.state, dtype=np.float32)
            info["bumped"] = True
            info["impulse"] = impulse
            self._settled_steps = 0

        return obs, reward, terminated, truncated, info
