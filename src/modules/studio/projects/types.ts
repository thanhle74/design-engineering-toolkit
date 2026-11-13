/**
 * Contracts for DET Studio Project & Figma Pages Management.
 */

export interface FigmaPage {
   id: string;
   name: string;
   figmaUrl: string;
   fileKey: string | null;
   nodeId: string;
   notes?: string;
   createdAt: string;
   updatedAt: string;
}

export interface ProjectRecord {
   id: string;
   name: string;
   platformId: string;
   description: string;
   createdAt: string;
   updatedAt: string;
   pages: FigmaPage[];
}

export interface CreateProjectInput {
   id?: string;
   name: string;
   platformId?: string;
   description?: string;
}

export interface AddFigmaPageInput {
   name: string;
   figmaUrl: string;
   notes?: string;
}
