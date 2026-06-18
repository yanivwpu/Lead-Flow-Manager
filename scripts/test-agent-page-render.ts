import "dotenv/config";
import { getPublicAgentPageData } from "../server/agentPage/agentPageService";

async function main() {
  try {
    const data = await getPublicAgentPageData(
      "yaniv-haramatiy-51f64011",
      "https://app.whachatcrm.com",
    );
    console.log("ok listings:", data?.listings?.length ?? 0);
  } catch (error) {
    console.error("FAIL:", error);
    process.exit(1);
  }
  process.exit(0);
}

main();
