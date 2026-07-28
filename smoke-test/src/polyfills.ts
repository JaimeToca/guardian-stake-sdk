// Must be imported FIRST (before any @guardian-sdk package) so the Buffer global
// exists when Cardano (@cardano-sdk/crypto, pbkdf2) and Tron (SHA256 hex handling)
// reference it. This is the minimal polyfill a wallet frontend needs for those chains.
import { Buffer } from "buffer";

globalThis.Buffer = globalThis.Buffer ?? Buffer;
