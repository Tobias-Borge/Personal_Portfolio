import random
from collections import deque

import numpy as np
from tensorflow.keras.layers import Dense, Input
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.optimizers import Adam


class DQNAgent:
    def __init__(self, states, actions):
        self.actions = actions
        self.memory = deque(maxlen=2000)
        self.gamma = 0.95
        self.epsilon = 1.0
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.batch_size = 32
        self.model = Sequential(
            [
                Input(shape=(int(states),)),
                Dense(24, activation="relu"),
                Dense(24, activation="relu"),
                Dense(int(actions), activation="linear"),
            ]
        )
        self.model.compile(optimizer=Adam(learning_rate=0.001), loss="mse")

    def act(self, state):
        if np.random.rand() < self.epsilon:
            return random.randrange(self.actions)
        q_values = self.model(np.array([state]), training=False).numpy()
        return int(np.argmax(q_values[0]))

    def remember(self, state, action, reward, next_state, terminated):
        self.memory.append((state, action, reward, next_state, terminated))

    def replay(self):
        if len(self.memory) < self.batch_size:
            return

        minibatch = random.sample(self.memory, self.batch_size)
        states = np.array([t[0] for t in minibatch], dtype=np.float32)
        actions = np.array([t[1] for t in minibatch])
        rewards = np.array([t[2] for t in minibatch], dtype=np.float32)
        next_states = np.array([t[3] for t in minibatch], dtype=np.float32)
        terminated = np.array([t[4] for t in minibatch], dtype=np.float32)

        q_values = self.model(states, training=False).numpy()
        next_q = np.max(self.model(next_states, training=False).numpy(), axis=1)
        targets = q_values.copy()
        targets[np.arange(self.batch_size), actions] = (
            rewards + self.gamma * next_q * (1.0 - terminated)
        )
        self.model.fit(states, targets, epochs=1, verbose=0)

        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    def save(self, path):
        self.model.save(path)
        print(f"Saved model to {path}")

    def load(self, path):
        self.model = load_model(path)
        self.epsilon = 0.0
        print(f"Loaded model from {path}")
