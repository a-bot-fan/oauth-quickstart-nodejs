import { Client } from "@hubspot/api-client";
import { SimplePublicObjectWithAssociations } from "@hubspot/api-client/lib/codegen/crm/contacts/models/SimplePublicObjectWithAssociations";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/tickets/models/Filter";
import { NextPage } from "@hubspot/api-client/lib/codegen/crm/tickets/models/NextPage";
import { PublicObjectSearchRequest } from "@hubspot/api-client/lib/codegen/crm/tickets/models/PublicObjectSearchRequest";
import { configDotenv } from "dotenv";
import express, { Request, Response } from "express";
import session from "express-session";
import NodeCache from "node-cache";
import request from "request-promise-native";

configDotenv();
const app = express();
const PORT = 3000;

const refreshTokenStore: Record<string, string> = {};
const accessTokenCache = new NodeCache({ deleteOnExpire: true });

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
  throw new Error("Missing CLIENT_ID or CLIENT_SECRET environment variable.");
}

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
let SCOPES = "crm.objects.contacts.read";
if (process.env.SCOPE) {
  SCOPES = process.env.SCOPE.split(/ |, ?|%20/).join(" ");
}
const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;

app.use(
  session({
    secret: Math.random().toString(36).substring(2),
    resave: false,
    saveUninitialized: true,
  })
);

const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${encodeURIComponent(
  CLIENT_ID
)}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(
  REDIRECT_URI
)}`;

app.get("/install", (req: Request, res: Response) => {
  res.redirect(authUrl);
});

app.get("/oauth-callback", async (req: Request, res: Response) => {
  if (req.query.code) {
    const authCodeProof = {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code: req.query.code as string,
    };
    const token = await exchangeForTokens(req.sessionID, authCodeProof);
    if (token.message) {
      return res.redirect(`/error?msg=${token.message}`);
    }
    res.redirect(`/`);
  }
});

const exchangeForTokens = async (userId: string, exchangeProof: any) => {
  try {
    const responseBody = await request.post(
      "https://api.hubapi.com/oauth/v1/token",
      {
        form: exchangeProof,
      }
    );
    const tokens = JSON.parse(responseBody);
    refreshTokenStore[userId] = tokens.refresh_token;
    accessTokenCache.set(
      userId,
      tokens.access_token,
      Math.round(tokens.expires_in * 0.75)
    );
    return tokens.access_token as string;
  } catch (e: any) {
    return JSON.parse(e.response.body);
  }
};

const refreshAccessToken = async (userId: string) => {
  const refreshTokenProof = {
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshTokenStore[userId],
  };
  return await exchangeForTokens(userId, refreshTokenProof);
};

const getAccessToken = async (userId: string) => {
  if (!accessTokenCache.get(userId)) {
    await refreshAccessToken(userId);
  }
  return accessTokenCache.get<string>(userId);
};

const isAuthorized = (userId: string) => {
  return !!refreshTokenStore[userId];
};

const getContact = async (accessToken: string) => {
  const client = new Client({ accessToken });
  const contacts = await client.crm.contacts.getAll();
  return contacts[0];
};

const getTickets = async (accessToken: string) => {
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
              value: `${Date.now() - 30 * 86400000 * 3}`,
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

const getNotes = async (accessToken: string) => {
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

const displayContactName = (
  res: Response,
  contact: SimplePublicObjectWithAssociations | Error
) => {
  if (
    "status" in contact &&
    "message" in contact &&
    contact.status === "error"
  ) {
    res.write(
      `<p>Unable to retrieve contact! Error Message: ${contact.message}</p>`
    );
    return;
  } else if ("properties" in contact) {
    const { firstname, lastname } = contact.properties;
    res.write(`<p>Contact name: ${firstname} ${lastname}</p>`);
  } else {
    res.write(`<p>Contact not found</p>`);
  }
};

app.get("/", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html");
  res.write(`<h2>HubSpot OAuth 2.0 Quickstart App</h2>`);
  if (isAuthorized(req.sessionID)) {
    const accessToken = await getAccessToken(req.sessionID);
    const contact = await getContact(accessToken as string);
    const tickets = await getTickets(accessToken as string);
    const notes = await getNotes(accessToken as string);
    res.write(`<h4>Access token: ${accessToken}</h4>`);
    displayContactName(res, contact);
    res.write(
      `<h4>Tickets: <pre>${JSON.stringify(tickets, null, 2)}</pre></h4>`
    );
    res.write(`<h4>Notes: <pre>${JSON.stringify(notes, null, 2)}</pre></h4>`);
  } else {
    res.write(`<a href="/install"><h3>Install the app</h3></a>`);
  }
  res.end();
});

app.get("/error", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html");
  res.write(`<h4>Error: ${req.query.msg}</h4>`);
  res.end();
});

app.listen(PORT, () => {
  console.log(`=== Starting your app on http://localhost:${PORT} ===`);
});
