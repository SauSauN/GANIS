import { call } from "./client";

/** Arc enregistré d'un personnage (document JSON, voir `lib/arcs.ts`). */
export interface StoredCharacterArc {
  characterId: string;
  data: string;
  updatedAt: string;
}

/** Planche d'inspiration enregistrée (éléments en JSON, voir `lib/boards.ts`). */
export interface StoredBoard {
  id: string;
  name: string;
  position: number;
  data: string;
  createdAt: string;
  updatedAt: string;
}

/** Arcs des personnages et planches d'inspiration (voir `commands/arcs_boards.rs`). */
export const arcsBoardsApi = {
  listCharacterArcs: (projectId: string) => call<StoredCharacterArc[]>("list_character_arcs", { projectId }),

  /** Enregistre tout l'arc d'un personnage ; renvoie l'heure d'enregistrement. */
  saveCharacterArc: (projectId: string, characterId: string, data: string) =>
    call<string>("save_character_arc", { projectId, characterId, data }),

  listBoards: (projectId: string) => call<StoredBoard[]>("list_boards", { projectId }),

  createBoard: (projectId: string, name: string) => call<StoredBoard>("create_board", { projectId, name }),

  renameBoard: (projectId: string, boardId: string, name: string) => call<StoredBoard>("rename_board", { projectId, boardId, name }),

  /** Enregistre les éléments d'une planche ; renvoie l'heure d'enregistrement. */
  saveBoardItems: (projectId: string, boardId: string, data: string) => call<string>("save_board_items", { projectId, boardId, data }),

  deleteBoard: (projectId: string, boardId: string) => call<void>("delete_board", { projectId, boardId }),
};
