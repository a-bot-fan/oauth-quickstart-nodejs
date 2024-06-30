import { Client } from "@hubspot/api-client";
import { NextPage } from "@hubspot/api-client/lib/codegen/crm/tickets/models/NextPage";

export const getAllNotes = async (accessToken: string) => {
  const pageSize = 100;
  const allNotes: any[] = [];
  let after: string | undefined = undefined;
  let morePagesAvailable: NextPage | true | undefined = true;

  const hubspotClient = new Client({ accessToken });

  while (morePagesAvailable) {
    const { results, paging } =
      await hubspotClient.crm.objects.notes.basicApi.getPage(
        pageSize,
        after,
        [
          "hs_note_body",
          "hs_timestamp",
          "hs_attachment_ids",
          "hubspot_owner_id",
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
