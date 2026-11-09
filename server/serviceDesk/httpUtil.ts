import type { Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { hasRole, visibleAccountIds, type Actor } from "./access";
import { TicketError } from "./ticketService";

export type Req = Request & { actor: Actor };

export const wrap = (fn: (req: Req, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) =>
  fn(req as Req, res).catch((e) => {
    if (e instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos", issues: e.issues });
    if (e instanceof TicketError) return res.status(e.status).json({ message: e.message });
    console.error("desk route error:", e);
    next(e);
  });

export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) =>
  hasRole((req as Req).actor, ...roles) ? next() : void res.status(403).json({ message: "Sin permiso" });

// Out-of-scope and non-existent accounts are indistinguishable: 404 either way.
export async function accountOr404(actor: Actor, accountId: number, res: Response): Promise<boolean> {
  if (!Number.isInteger(accountId) || !(await visibleAccountIds(actor)).includes(accountId)) {
    res.status(404).json({ message: "No encontrado" });
    return false;
  }
  return true;
}
