import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TicketsPage from "./TicketsPage";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest }));

const json = (v: unknown) => Promise.resolve({ json: () => Promise.resolve(v) });
// Query string of the most recent ticket list request.
const lastQuery = () => {
  const urls = apiRequest.mock.calls.map((c) => String(c[1])).filter((u) => u.startsWith("/api/desk/tickets?"));
  return new URLSearchParams(urls.at(-1)!.split("?")[1]);
};
const statusBox = () => screen.getByRole("combobox", { name: "Filtrar por estado" });
const option = (name: string) => screen.getByRole("option", { name });

beforeAll(() => {
  // cmdk needs these and jsdom does not implement them.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => {
  localStorage.clear();
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url.startsWith("/api/desk/tickets?")) return json({ rows: [], total: 0 });
    if (url === "/api/desk/tickets/summary") return json({});
    return json([]);
  });
});
afterEach(cleanup);

describe("TicketsPage: filtro de estados", () => {
  it("permite marcar varios estados sin cerrar la lista y los manda juntos", async () => {
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.click(statusBox());
    await user.click(option("Nuevo"));
    await user.click(option("En progreso"));
    await waitFor(() => expect(lastQuery().get("status")).toBe("new,in_progress"));
    expect(option("Nuevo").getAttribute("data-checked")).toBe("true");
    expect(option("Triage").getAttribute("data-checked")).toBe("false");
    expect(statusBox().textContent).toContain("Nuevo, En progreso");
    expect(lastQuery().get("open")).toBe("1");
  });

  it("volver a marcar un estado lo quita", async () => {
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.click(statusBox());
    await user.click(option("Nuevo"));
    await user.click(option("Triage"));
    await user.click(option("Nuevo"));
    await waitFor(() => expect(lastQuery().get("status")).toBe("triage"));
  });

  it("resume la selección cuando son tres o más", async () => {
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.click(statusBox());
    for (const n of ["Nuevo", "Triage", "En progreso"]) await user.click(option(n));
    expect(statusBox().textContent).toContain("3 estados");
  });

  it("\"Todos los estados\" limpia la selección", async () => {
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.click(statusBox());
    await user.click(option("Nuevo"));
    await user.click(option("Triage"));
    await user.click(option("Todos los estados"));
    await waitFor(() => expect(lastQuery().get("status")).toBeNull());
    expect(statusBox().textContent).toContain("Todos los estados");
  });

  it("al marcar un estado cerrado deja de filtrar solo abiertos", async () => {
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.click(statusBox());
    await user.click(option("En progreso"));
    await user.click(option("Resuelto"));
    await waitFor(() => expect(lastQuery().get("status")).toBe("in_progress,resolved"));
    expect(lastQuery().get("open")).toBeNull();
  });

  it("restaura la selección guardada", async () => {
    localStorage.setItem("desk.tickets.view.v1", JSON.stringify({ f: { status: "new,triage" }, sort: { sort: "priority", dir: "desc" }, pageSize: 50 }));
    render(<TicketsPage />);
    await waitFor(() => expect(lastQuery().get("status")).toBe("new,triage"));
    expect(statusBox().textContent).toContain("Nuevo, Triage");
  });
});
