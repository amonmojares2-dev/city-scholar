import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./page/Home";

function Login() {
  return (
    <div style={{ padding: "50px" }}>
      Login Page
    </div>
  );
}

function Register() {
  return (
    <div style={{ padding: "50px" }}>
      Register Page
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route path="/" element={<Home />} />

        <Route path="/login" element={<Login />} />

        <Route path="/register" element={<Register />} />

      </Routes>

    </BrowserRouter>
  );
}