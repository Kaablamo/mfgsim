import axios from "axios";

const WS_BASE_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

export const apiClient = axios.create({
  headers: { "Content-Type": "application/json" },
});

export const WS_URL = `${WS_BASE_URL}/ws/simulation`;
