import * as luxon from "luxon";
import axios from "axios";
import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } from "@aws-sdk/client-cloudwatch-logs";
import delay from "delay";

const TEAM_ID = process.env.TEAM_ID || "";
const GAME_ID = process.env.GAME_ID || "";

const log = new CloudWatchLogsClient({ region: process.env.AWS_REGION });

async function main() {
  setInterval(async () => {
    // Start query
    const query = await log.send(
      new StartQueryCommand({
        startTime: 0,
        endTime: luxon.DateTime.now().toSeconds(),
        logGroupNames: ["LOG_GROUP_NAME"],
        queryString: "fields @timestamp, @message | sort @timestamp desc | limit 1000 | filter @message like /Refund/",
      }),
    );
    const queryId = query.queryId;
    await delay(10000); // Wait 10 sec
    // Get query result
    const result = await log.send(new GetQueryResultsCommand({ queryId }));
    if (result.results) {
      let uuids = [];
      for (const fields of result.results) {
        for (let field of fields) {
          if (field.field === "@message" && field.value) {
            const uuid = field.value.split(":").pop();
            if (uuid) uuids.push(uuid.trim());
          }
        }
      }
      uuids = [...new Set(uuids)];
      for (const uuid of uuids) {
        const response = await axios({
          method: "POST",
          url: "https://stats.aws.dev-null.link/proc/refund",
          data: JSON.stringify({
            game: GAME_ID,
            team: TEAM_ID,
            order: uuid,
          }),
        });
        console.log(`[${uuid}] - ${response.data}`);
      }
    }
  }, 10000);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = -1;
});
