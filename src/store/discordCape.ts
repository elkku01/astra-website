/**
 * The Discord cloak: never sold, never part of the collection and never granted by hand. A player
 * has it only while they are a member of the Astra Discord server. The presence API checks the
 * membership with Discord (from the launcher, every 15 minutes while it runs) and reports it to
 * the store; a grant that is not renewed runs out by itself.
 */
export const DISCORD_CAPE_ID = 'donut'
export const DISCORD_CAPE_NAME = 'DonutSMP Finland Cloak'
export const DISCORD_GUILD_ID = '1483442785691631677'
export const DISCORD_INVITE = 'https://discord.gg/VyqSyrQS6'
/** How long one confirmed membership keeps the cloak if no new check arrives. */
export const DISCORD_GRANT_MS = 2 * 60 * 60 * 1000
