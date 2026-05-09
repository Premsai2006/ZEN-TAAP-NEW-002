// Theme helpers — light/dark mode persisted in localStorage and applied via [data-theme] on <html>
const KEY = "tt_theme";

export const getTheme = () => {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(KEY) || "dark";
};

export const setTheme = (theme) => {
  const t = theme === "light" ? "light" : "dark";
  localStorage.setItem(KEY, t);
  document.documentElement.setAttribute("data-theme", t);
  return t;
};

export const initTheme = () => {
  const t = getTheme();
  document.documentElement.setAttribute("data-theme", t);
  return t;
};
