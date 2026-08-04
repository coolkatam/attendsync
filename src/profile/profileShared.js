// src/profile/profileShared.js
// Small shared constants/helpers used by both FacultyProfilePage and
// ResumeView. Kept in their own module (rather than one importing from the
// other) to avoid a circular import between the two.

export const SC = {
  qualifications: { main: "#1d4ed8", light: "#dbeafe", dark: "#1e3a8a", icon: "🎓" },
  experience:     { main: "#be185d", light: "#fce7f3", dark: "#831843", icon: "💼" },
  publications:   { main: "#0f766e", light: "#ccfbf1", dark: "#134e4a", icon: "📄" },
  workshops:      { main: "#b45309", light: "#fef3c7", dark: "#78350f", icon: "🛠️" },
  conferences:    { main: "#6d28d9", light: "#ede9fe", dark: "#4c1d95", icon: "🎤" },
  projects:       { main: "#c2410c", light: "#ffedd5", dark: "#7c2d12", icon: "🧪" },
  bio:            { main: "#0369a1", light: "#e0f2fe", dark: "#0c4a6e", icon: "👤" },
  skills:         { main: "#4338ca", light: "#e0e7ff", dark: "#312e81", icon: "🧰" },
  interest:       { main: "#e11d48", light: "#ffe4e6", dark: "#881337", icon: "🔬" },
};

export function fmtMY(v) {
  if (!v) return "";
  const [y, m] = v.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (months[Number(m)] || "") + " " + y;
}
