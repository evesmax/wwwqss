import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AgentKeysPage, { addedSensitive } from "./AgentKeysPage";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest }));

const KEYS = [
  { id: 1, keyId: "qa_aaa", name: "Claude Code (Everardo)", productIds: [], allProducts: true, permissions: ["transition_terminal", "release"], active: true, lastUsedAt: "2026-11-20T10:00:00Z" },
  { id: 2, keyId: "qa_bbb", name: "jarvis-qss", productIds: [10, 11], allProducts: false, permissions: ["create_ticket"], active: false, lastUsedAt: null },
];
const PRODUCTS = [{ id: 10, code: "QPULSEMES", name: "QPulse" }, { id: 11, code: "PLATAFORMAQSS", name: "Plataforma" }];
const json = (v: unknown) => Promise.resolve({ json: () => Promise.resolve(v) });

function setup(roles: string[]) {
  apiRequest.mockImplementation((method: string, url: string) => {
    if (url === "/api/desk/me") return json({ roles });
    if (url === "/api/desk/agent-keys" && method === "GET") return json(KEYS);
    if (url === "/api/desk/products") return json(PRODUCTS);
    if (url === "/api/desk/agent-keys" && method === "POST") return json({ id: 3, keyId: "qa_new", name: "Nueva", token: "qa_new.SECRETO" });
    if (url.endsWith("/rotate")) return json({ id: 2, keyId: "qa_bbb", name: "jarvis-qss", token: "qa_bbb.ROTADO" });
    if (method === "PUT") return json({});
    return json(null);
  });
}
const calls = (method: string) => apiRequest.mock.calls.filter((c) => c[0] === method);

beforeEach(() => { apiRequest.mockReset(); });
afterEach(cleanup);

describe("AgentKeysPage", () => {
  it("un usuario que no es owner no ve la sección ni se piden las llaves", async () => {
    setup(["support_manager"]);
    render(<AgentKeysPage />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Solo el Owner"));
    expect(screen.queryByText("Llaves de agente")).toBeNull();
    expect(screen.queryByText("Nueva llave")).toBeNull();
    expect(apiRequest.mock.calls.some((c) => String(c[1]).includes("agent-keys"))).toBe(false);
  });

  it("si /desk/me falla tampoco la muestra", async () => {
    apiRequest.mockImplementation(() => Promise.reject(new Error("403: x")));
    render(<AgentKeysPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Nueva llave")).toBeNull();
  });

  it("el owner ve la tabla con nombre, keyId, productos, permisos, activa y último uso", async () => {
    setup(["owner"]);
    render(<AgentKeysPage />);
    const row1 = (await screen.findByText("Claude Code (Everardo)")).closest("tr")!;
    expect(within(row1).getByText("qa_aaa")).toBeTruthy();
    expect(within(row1).getByText("Todos")).toBeTruthy();
    expect(within(row1).getByText("release")).toBeTruthy();
    expect(within(row1).getByText("Sí")).toBeTruthy();
    const row2 = screen.getByText("jarvis-qss").closest("tr")!;
    expect(within(row2).getByText("QPULSEMES, PLATAFORMAQSS")).toBeTruthy();
    expect(within(row2).getByText("create_ticket")).toBeTruthy();
    expect(within(row2).getByText("No")).toBeTruthy();
    expect(within(row2).getByText("nunca")).toBeTruthy();
  });

  it("editar sin permisos sensibles nuevos guarda con PUT completo y sin confirmación", async () => {
    setup(["owner"]);
    const u = userEvent.setup();
    render(<AgentKeysPage />);
    await u.click(await screen.findByLabelText("Editar jarvis-qss"));
    const dlg = screen.getByRole("dialog");
    await u.click(within(dlg).getByRole("checkbox", { name: /Llave activa/ }));
    await u.click(within(dlg).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    expect(calls("PUT")[0].slice(0, 3)).toEqual(["PUT", "/api/desk/agent-keys/2", { name: "jarvis-qss", productIds: [10, 11], allProducts: false, permissions: ["create_ticket"], active: true }]);
    expect(screen.queryByText("Confirmar permisos sensibles")).toBeNull();
  });

  it("agregar release pide confirmación y no guarda hasta aceptar", async () => {
    setup(["owner"]);
    const u = userEvent.setup();
    render(<AgentKeysPage />);
    await u.click(await screen.findByLabelText("Editar jarvis-qss"));
    await u.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: /release/ }));
    await u.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Confirmar permisos sensibles")).toBeTruthy();
    expect(calls("PUT")).toHaveLength(0);
    await u.click(screen.getByRole("button", { name: "Volver" }));
    expect(calls("PUT")).toHaveLength(0);
    await u.click(screen.getByRole("button", { name: "Guardar" }));
    await u.click(screen.getByRole("button", { name: "Sí, guardar" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    expect((calls("PUT")[0][2] as any).permissions).toEqual(["create_ticket", "release"]);
  });

  it("quitar un permiso sensible o mantenerlo no pide confirmación", async () => {
    setup(["owner"]);
    const u = userEvent.setup();
    render(<AgentKeysPage />);
    await u.click(await screen.findByLabelText("Editar Claude Code (Everardo)"));
    await u.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: /transition_terminal/ }));
    await u.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    expect((calls("PUT")[0][2] as any).permissions).toEqual(["release"]);
  });

  it("crear con release pide confirmación, muestra el secreto una sola vez y lo copia", async () => {
    setup(["owner"]);
    const u = userEvent.setup(); // installs its own clipboard stub
    render(<AgentKeysPage />);
    await u.click(await screen.findByText("Nueva llave"));
    const dlg = screen.getByRole("dialog");
    await u.type(within(dlg).getByRole("textbox"), "Nueva");
    await u.click(within(dlg).getByRole("checkbox", { name: /Todos los productos/ }));
    await u.click(within(dlg).getByRole("checkbox", { name: /release/ }));
    await u.click(within(dlg).getByRole("button", { name: "Crear llave" }));
    await u.click(await screen.findByRole("button", { name: "Sí, guardar" }));
    const tok = await screen.findByTestId("agent-token");
    expect(tok.textContent).toBe("qa_new.SECRETO");
    expect(screen.getByText(/no se volverá a mostrar/)).toBeTruthy();
    expect(calls("POST")[0].slice(0, 3)).toEqual(["POST", "/api/desk/agent-keys", { name: "Nueva", productIds: [], allProducts: true, permissions: ["release"] }]);
    await u.click(screen.getByRole("button", { name: "Copiar" }));
    expect(await navigator.clipboard.readText()).toBe("qa_new.SECRETO");
    await u.click(screen.getByRole("button", { name: "Ya la guardé" }));
    expect(screen.queryByTestId("agent-token")).toBeNull();
  });

  it("rotar pide confirmación y luego muestra el nuevo secreto", async () => {
    setup(["owner"]);
    const u = userEvent.setup();
    render(<AgentKeysPage />);
    await u.click(await screen.findByLabelText("Rotar jarvis-qss"));
    expect(calls("POST")).toHaveLength(0);
    await u.click(screen.getByRole("button", { name: "Rotar llave" }));
    expect((await screen.findByTestId("agent-token")).textContent).toBe("qa_bbb.ROTADO");
    expect(calls("POST")[0][1]).toBe("/api/desk/agent-keys/2/rotate");
  });

  it("activar/desactivar manda los valores actuales con active invertido", async () => {
    setup(["owner"]);
    const u = userEvent.setup();
    render(<AgentKeysPage />);
    await u.click(await screen.findByLabelText("Activar jarvis-qss"));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    expect(calls("PUT")[0][2]).toEqual({ name: "jarvis-qss", productIds: [10, 11], allProducts: false, permissions: ["create_ticket"], active: true });
  });
});

describe("addedSensitive", () => {
  it("solo cuenta los sensibles que se agregan", () => {
    expect(addedSensitive([], ["release", "create_ticket"])).toEqual(["release"]);
    expect(addedSensitive(["release"], ["release", "transition_terminal"])).toEqual(["transition_terminal"]);
    expect(addedSensitive(["release"], ["create_ticket"])).toEqual([]);
  });
});
