// Muestra el ID de los grupos donde está tu bot. Uso: npm run telegram:chat
// Antes: mete el bot en el grupo y escribe /start en el grupo.
import "dotenv/config";
import { chatsFromUpdates } from "../src/lib/espia/telegram";

chatsFromUpdates()
  .then((chats) => {
    if (!chats.size) return console.log("No veo mensajes. Escribe /start en el grupo y vuelve a ejecutarlo.");
    for (const [id, name] of chats) console.log(`${id}  ${name}`);
    console.log("\nCopia el ID del grupo (empieza por -) en ESPIA_LIGAS=liga:grupo,liga:grupo");
  })
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  });
