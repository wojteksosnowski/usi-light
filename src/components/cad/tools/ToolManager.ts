import { CadInteractionTool, ToolContext } from './CadTool';

export class ToolManager {
  private tools: Map<string, CadInteractionTool> = new Map();
  private activeTool: CadInteractionTool | null = null;

  public registerTool(tool: CadInteractionTool): void {
    this.tools.set(tool.id, tool);
  }

  public getTool(id: string): CadInteractionTool | undefined {
    return this.tools.get(id);
  }

  public getActiveTool(): CadInteractionTool | null {
    return this.activeTool;
  }

  public setActiveTool(id: string | null, ctx: ToolContext): void {
    if (this.activeTool) {
      this.activeTool.onDeactivate?.(ctx);
    }
    if (id && this.tools.has(id)) {
      this.activeTool = this.tools.get(id)!;
      this.activeTool.onActivate?.(ctx);
    } else {
      this.activeTool = null;
    }
  }
}
