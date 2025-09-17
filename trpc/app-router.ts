import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import { z } from "zod";
import { publicProcedure } from "./create-context";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  export: createTRPCRouter({
    createExport: publicProcedure
      .query(() => {
        // In a real implementation, this would generate the zip file
        return {
          success: true,
          downloadUrl: "https://github.com/downloads/sara-alert-export.zip",
          message: "Export created successfully"
        };
      }),
    downloadExport: publicProcedure
      .input(z.object({ filename: z.string().optional() }))
      .query(({ input }) => {
        const filename = input.filename || "sara-alert-export.zip";
        return {
          success: true,
          downloadUrl: `https://github.com/downloads/${filename}`,
          message: "Download URL generated successfully"
        };
      })
  }),
});

export type AppRouter = typeof appRouter;