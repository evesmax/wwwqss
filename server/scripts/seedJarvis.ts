// Uso: tsx server/scripts/seedJarvis.ts data            -> productos faltantes + cuenta interna (sin llave)
//      tsx server/scripts/seedJarvis.ts key [--inactive] -> crea la llave jarvis-qss y la imprime UNA vez en esta terminal
import { createJarvisKey, seedInternalAccount, seedProducts } from "../serviceDesk/jarvisSeed";

async function main() {
  const mode = process.argv[2];
  if (mode === "data") {
    const made = await seedProducts();
    const acc = await seedInternalAccount();
    console.log("Productos creados:", made.length ? made.join(", ") : "(ninguno; ya existían)", "| cuenta interna:", acc);
  } else if (mode === "key") {
    const k = await createJarvisKey({ active: !process.argv.includes("--inactive") });
    console.log(`Llave creada (id ${k.id}, ${process.argv.includes("--inactive") ? "INACTIVA" : "activa"}). Cópiala ahora; no se vuelve a mostrar:\n\n${k.token}\n`);
  } else throw new Error("Uso: data | key [--inactive]");
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
