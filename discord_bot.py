import os
import discord
from discord.ext import commands
from core.uio import build_uio

TOKEN = os.getenv("DISCORD_TOKEN")

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    print(f"VolatiAI Discord Bot is online as {bot.user}")


# ------------------------------------------------------------
# Full UIO dump
# ------------------------------------------------------------
@bot.command()
async def uio(ctx):
    uio = build_uio()
    await ctx.send(f"```json\n{uio}\n```")


# ------------------------------------------------------------
# Developer Intelligence
# ------------------------------------------------------------
@bot.command()
async def developer(ctx):
    uio = build_uio()
    dev = uio.get("developer", {})
    await ctx.send(f"```json\n{dev}\n```")


# ------------------------------------------------------------
# Market Intelligence
# ------------------------------------------------------------
@bot.command()
async def market(ctx):
    uio = build_uio()
    market = uio.get("market", {})
    await ctx.send(f"```json\n{market}\n```")


# ------------------------------------------------------------
# Agents (Pro tier)
# ------------------------------------------------------------
@bot.command()
async def agents(ctx):
    uio = build_uio()
    agents = uio.get("agents", {})
    await ctx.send(f"```json\n{agents}\n```")


# ------------------------------------------------------------
# Trend Agent
# ------------------------------------------------------------
@bot.command()
async def trend(ctx):
    uio = build_uio()
    trend = uio.get("agents", {}).get("trend", {})
    await ctx.send(f"```json\n{trend}\n```")


# ------------------------------------------------------------
# Whale Agent
# ------------------------------------------------------------
@bot.command()
async def whale(ctx):
    uio = build_uio()
    whale = uio.get("agents", {}).get("whale", {})
    await ctx.send(f"```json\n{whale}\n```")


# ------------------------------------------------------------
# Spoof Agent
# ------------------------------------------------------------
@bot.command()
async def spoof(ctx):
    uio = build_uio()
    spoof = uio.get("agents", {}).get("spoof", {})
    await ctx.send(f"```json\n{spoof}\n```")


# ------------------------------------------------------------
# Narrative Agent
# ------------------------------------------------------------
@bot.command()
async def narrative(ctx):
    uio = build_uio()
    narrative = uio.get("agents", {}).get("narrative", {})
    await ctx.send(f"```json\n{narrative}\n```")


# ------------------------------------------------------------
# Risk Agent
# ------------------------------------------------------------
@bot.command()
async def risk(ctx):
    uio = build_uio()
    risk = uio.get("agents", {}).get("risk", {})
    await ctx.send(f"```json\n{risk}\n```")


bot.run(TOKEN)
