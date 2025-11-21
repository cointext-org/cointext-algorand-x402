import { startAvmFacilitatorServer } from "../../src/avm402/facilitator.js";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.AVM_FACILITATOR_PORT || 4100);

startAvmFacilitatorServer(PORT);
