import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/tickets/models/Filter";
import { NextPage } from "@hubspot/api-client/lib/codegen/crm/tickets/models/NextPage";
import { PublicObjectSearchRequest } from "@hubspot/api-client/lib/codegen/crm/tickets/models/PublicObjectSearchRequest";

export const getTicketsForDays = async (accessToken: string, days = 90) => {
  const pageSize = 100;
  const allTickets: any[] = [];
  let after: string = "";
  let morePagesAvailable: NextPage | true | undefined = true;

  const hubspotClient = new Client({ accessToken });
  while (morePagesAvailable) {
    const PublicObjectSearchRequest: PublicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "createdate",
              operator: FilterOperatorEnum.Gte,
              value: `${Date.now() - days * 86400000}`,
            },
          ],
        },
      ],
      sorts: ["createdate"],
      limit: pageSize,
      after,
      properties: [],
    };

    const { results, paging } =
      await hubspotClient.crm.tickets.searchApi.doSearch(
        PublicObjectSearchRequest
      );
    allTickets.push(...results);
    morePagesAvailable = paging?.next;
    if (morePagesAvailable) {
      after = paging?.next?.after as string;
    }
  }

  return allTickets;
};

export const getAllTickets = async (accessToken: string) => {
  const pageSize = 1;
  const allTickets: any[] = [];
  let after: string | undefined = undefined;
  let morePagesAvailable: NextPage | true | undefined = true;

  const hubspotClient = new Client({ accessToken });
  while (morePagesAvailable) {
    const { results, paging } =
      await hubspotClient.crm.tickets.basicApi.getPage(
        pageSize,
        after,
        [
          "subject",
          "content",
          "hs_pipeline",
          "hs_pipeline_stage",
          "hs ticket category",
          "hs ticket priority",
        ],
        [],
        ["note", "email", "call", "task", "meeting"]
      );
    allTickets.push(...results);
    morePagesAvailable = paging?.next;
    if (morePagesAvailable) {
      after = paging?.next?.after as string;
    }
    console.log(paging);
  }

  return allTickets;
};
