/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { Client } = require("pg");

const { getDatabaseConfig, getRequiredEnv } = require("./lib");

const env = getRequiredEnv(process.env);

async function withDatabase(callback) {
  const config = await getDatabaseConfig(env);
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.dbname,
    user: config.username,
    password: config.password,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function createAdminEvent(input) {
  const normalizedSlug = input.slug.trim().toLowerCase();

  return withDatabase(async (client) => {
    const result = await client.query(
      `
        INSERT INTO events (
          id,
          slug,
          title,
          venue,
          description,
          scheduled_at,
          ends_at,
          public_base_url
        )
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
        RETURNING
          id,
          slug,
          title,
          venue,
          description,
          scheduled_at AS "startsAt",
          ends_at AS "endsAt",
          '0' AS "photoCount"
      `,
      [
        normalizedSlug,
        normalizedSlug,
        input.title,
        input.venue,
        input.description,
        input.startsAt,
        input.endsAt,
        env.publicBaseUrl,
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      venue: row.venue || "",
      description: row.description || "",
      startsAt: row.startsAt || input.startsAt,
      endsAt: row.endsAt || input.endsAt,
      photoCount: 0,
    };
  });
}

async function handler(event) {
  try {
    if (!event || event.operation !== "createAdminEvent") {
      return { statusCode: 400, errorMessage: "Unsupported admin event write operation" };
    }

    return await createAdminEvent(event.input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return { statusCode: 409, errorMessage: "An event with this slug already exists" };
    }

    return { statusCode: 500, errorMessage: message };
  }
}

module.exports = { handler };
