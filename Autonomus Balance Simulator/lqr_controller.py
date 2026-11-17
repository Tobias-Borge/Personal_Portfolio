import math

import numpy as np


# Bryson-style weights: keep the cart on the track and the pole near upright.
# Fail angle in this project is 90°, but LQR is only valid near vertical, so
# theta is still penalized as if 12° were a lot.
DEFAULT_Q = np.diag(
    [
        1.0 / 2.4**2,
        1.0 / 2.0**2,
        1.0 / math.radians(12.0) ** 2,
        1.0 / 1.5**2,
    ]
)
DEFAULT_R = np.array([[1.0 / 10.0**2]])


def _params_from_env(env):
    if env is None:
        return {
            "gravity": 9.8,
            "masscart": 1.0,
            "masspole": 0.1,
            "length": 0.5,
            "force_mag": 10.0,
            "tau": 0.02,
        }
    raw = env.unwrapped
    return {
        "gravity": float(raw.gravity),
        "masscart": float(raw.masscart),
        "masspole": float(raw.masspole),
        "length": float(raw.length),
        "force_mag": float(raw.force_mag),
        "tau": float(raw.tau),
    }


def linearized_dynamics(params):
    """Continuous-time A, B around upright [x, x_dot, theta, theta_dot]."""
    g = params["gravity"]
    mc = params["masscart"]
    mp = params["masspole"]
    length = params["length"]
    mt = mc + mp
    polemass_length = mp * length
    den = length * (4.0 / 3.0 - mp / mt)

    A = np.array(
        [
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, -polemass_length * g / (mt * den), 0.0],
            [0.0, 0.0, 0.0, 1.0],
            [0.0, 0.0, g / den, 0.0],
        ]
    )
    B = np.array(
        [
            [0.0],
            [1.0 / mt + polemass_length / (mt**2 * den)],
            [0.0],
            [-1.0 / (mt * den)],
        ]
    )
    return A, B


def discretize_euler(A, B, tau):
    """Match Gymnasium CartPole's explicit Euler step."""
    return np.eye(A.shape[0]) + tau * A, tau * B


def _dare_iterate(A, B, Q, R, n_iter=500, tol=1e-10):
    P = np.array(Q, dtype=float)
    for _ in range(n_iter):
        BtP = B.T @ P
        K_term = np.linalg.solve(R + BtP @ B, BtP)
        P_next = A.T @ P @ A - A.T @ P @ B @ K_term @ A + Q
        if np.max(np.abs(P_next - P)) < tol:
            return P_next
        P = 0.5 * (P_next + P)
    return P


def discrete_lqr(A, B, Q, R):
    B = np.asarray(B, dtype=float).reshape(-1, 1)
    Q = np.asarray(Q, dtype=float)
    R = np.asarray(R, dtype=float).reshape(1, 1)
    try:
        from scipy.linalg import solve_discrete_are

        P = solve_discrete_are(A, B, Q, R)
    except ImportError:
        P = _dare_iterate(A, B, Q, R)
    K = np.linalg.solve(R + B.T @ P @ B, B.T @ P @ A)
    return K.ravel(), P


class LQRController:
    """Bang-bang LQR: compute u = -Kx, then push left/right like CartPole-v1."""

    def __init__(self, env=None, Q=None, R=None):
        params = _params_from_env(env)
        Q = DEFAULT_Q if Q is None else np.asarray(Q, dtype=float)
        R = DEFAULT_R if R is None else np.asarray(R, dtype=float)
        A, B = linearized_dynamics(params)
        Ad, Bd = discretize_euler(A, B, params["tau"])
        self.K, self.P = discrete_lqr(Ad, Bd, Q, R)
        self.force_mag = params["force_mag"]
        self.A = A
        self.B = B
        print(
            "LQR K = "
            f"[x={self.K[0]:+.3f}, x_dot={self.K[1]:+.3f}, "
            f"theta={self.K[2]:+.3f}, theta_dot={self.K[3]:+.3f}]"
        )

    def desired_force(self, state):
        return float(-self.K @ np.asarray(state, dtype=float).reshape(4))

    def act(self, state):
        return 1 if self.desired_force(state) >= 0.0 else 0
