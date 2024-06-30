import { Client } from "@hubspot/api-client";
import { NextPage } from "@hubspot/api-client/lib/codegen/crm/tickets/models/NextPage";

export const getAllTasks = async (accessToken: string) => {
  const pageSize = 100;
  const allNotes: any[] = [];
  let after: string | undefined = undefined;
  let morePagesAvailable: NextPage | true | undefined = true;

  const hubspotClient = new Client({ accessToken });

  while (morePagesAvailable) {
    const { results, paging } =
      await hubspotClient.crm.objects.tasks.basicApi.getPage(
        pageSize,
        after,
        [
          "hs_timestamp",
          "hs_task_body",
          "hubspot_owner_id",
          "hs_task_subject",
          "hs_task_status",
          "hs_task_priority",
          "hs_task_type",
          "hs_task_reminders",
        ],
        [],
        ["ticket", "contact"]
      );
    allNotes.push(...results);
    morePagesAvailable = paging?.next;
    if (morePagesAvailable) {
      after = paging?.next?.after as string;
    }
  }
  return allNotes;
};
