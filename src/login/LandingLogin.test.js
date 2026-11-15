import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockCall = jest.fn();
const mockSendReset = jest.fn(async () => {});
const mockSignInCustom = jest.fn(async () => {});
jest.mock("../firebase", () => ({ auth: {}, functions: {} }));
jest.mock("firebase/functions", () => ({ httpsCallable: (_f, name) => data => mockCall(name, data) }));
jest.mock("firebase/auth", () => ({ sendPasswordResetEmail: (...a) => mockSendReset(...a), signInWithCustomToken: (...a) => mockSignInCustom(...a) }));
const LandingLogin = require("./LandingLogin").default;

beforeEach(() => { mockCall.mockReset(); mockSendReset.mockClear(); mockSignInCustom.mockClear(); });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test("the page has New user and Existing user, and a Master Admin link", () => {
  render(<LandingLogin onLogin={() => {}} />);
  expect(screen.getByText("New user")).toBeTruthy();
  expect(screen.getByText("Existing user")).toBeTruthy();
  expect(screen.getByText("Master Admin")).toBeTruthy();
  expect(screen.queryByText(/old mobile/i)).toBeNull();
});

test("a new user must give an Employee ID and a college email", async () => {
  render(<LandingLogin onLogin={() => {}} />);
  fireEvent.click(screen.getByText("Send password link"));
  expect(screen.getByText("Enter your Employee ID.")).toBeTruthy();
  type("Employee ID", "RE0009");
  type("College email", "me@gmail.com");
  fireEvent.click(screen.getByText("Send password link"));
  expect(screen.getByText(/Enter your college email/)).toBeTruthy();
  expect(mockCall).not.toHaveBeenCalled();
});

test("when the ID and email match, the password link is emailed and the page says so", async () => {
  mockCall.mockResolvedValue({ data: { ok: true, firstTime: true, continueUrl: "https://x/" } });
  render(<LandingLogin onLogin={() => {}} />);
  type("Employee ID", "re0009");
  type("College email", "Me@raghuenggcollege.in");
  fireEvent.click(screen.getByText("Send password link"));
  await screen.findByText(/Password link is sent to your official college email/);
  expect(screen.getByText(/check Spam/)).toBeTruthy();
  expect(mockCall).toHaveBeenCalledWith("passwordLinkCheck", { employeeId: "RE0009", email: "me@raghuenggcollege.in", purpose: "first" });
  expect(mockSendReset).toHaveBeenCalledWith({}, "me@raghuenggcollege.in", { url: "https://x/" });
});

test("when they do not match, the person is told to contact the HoD and no mail is sent", async () => {
  mockCall.mockRejectedValue({ message: "We could not match this Employee ID and college email. Please contact the HoD." });
  render(<LandingLogin onLogin={() => {}} />);
  type("Employee ID", "RE0009");
  type("College email", "me@raghuenggcollege.in");
  fireEvent.click(screen.getByText("Send password link"));
  await screen.findByText(/Please contact the HoD/);
  expect(mockSendReset).not.toHaveBeenCalled();
});

test("an existing user signs in with Employee ID and password", async () => {
  const onLogin = jest.fn();
  mockCall.mockResolvedValue({ data: { token: "t", id: "RE0009", user: { name: "Dr X", role: "faculty", email: "x@raghuenggcollege.in", employeeId: "RE0009" } } });
  render(<LandingLogin onLogin={onLogin} />);
  fireEvent.click(screen.getByText("Existing user"));
  type("Employee ID", "re0009");
  type("Password", "secret123");
  fireEvent.click(screen.getByText("Login"));
  await waitFor(() => expect(onLogin).toHaveBeenCalled());
  expect(mockCall).toHaveBeenCalledWith("employeeLogin", { employeeId: "RE0009", password: "secret123" });
  expect(onLogin.mock.calls[0][0]).toMatchObject({ phone: "RE0009", role: "faculty", name: "Dr X" });
  expect(mockSignInCustom).toHaveBeenCalled();
});

test("forgot password asks for the ID and email, then emails a link", async () => {
  mockCall.mockResolvedValue({ data: { ok: true, continueUrl: "https://x/" } });
  render(<LandingLogin onLogin={() => {}} />);
  fireEvent.click(screen.getByText("Existing user"));
  fireEvent.click(screen.getByText("Forgot password?"));
  type("Employee ID", "RE0009");
  type("College email", "me@raghuenggcollege.in");
  fireEvent.click(screen.getByText("Email me a link"));
  await screen.findByText(/Password link is sent/);
  expect(mockCall).toHaveBeenCalledWith("passwordLinkCheck", expect.objectContaining({ purpose: "forgot" }));
});

test("the Master Admin link opens the mobile number and PIN sign-in", () => {
  render(<LandingLogin onLogin={() => {}} />);
  fireEvent.click(screen.getByText("Master Admin"));
  expect(screen.getByLabelText("Mobile number")).toBeTruthy();
  expect(screen.getByText("← Sign in")).toBeTruthy();
});
