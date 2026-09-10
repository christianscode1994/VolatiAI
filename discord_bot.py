import os
import json
import discord
from discord.ext import commands
from core.uio import build_uio

TOKEN = os.getenv("DISCORD_TOKEN")

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


def embed_from_dict(title: str, data: dict, color=0x5865F2):
    """
    Convert a Python dict into a Discord embed with formatted JSON.
    """
    embed = discord.Embed(
        title=title,
        description=f"```json\n{json.dumps(data, indent=2)}\n```",
        color=color
    )
    return embed


@bot.event
async def on_ready():
    print(f"VolatiAI Discord Bot is online as {bot.user}")


# ------------------------------------------------------------
# Full UIO
# ------------------------------------------------------------
@bot.command()
async def uio(ctx):
    uio = build_uio()
    embed = embed_from_dict("Unified Intelligence Object", uio)
    await ctx.send(embed=embed)


# ------------------------------------------------------------
# Developer Intelligence
# ------------------------------------------------------------
@bot.command()
async def developer(ctx):
    uio = build_uio()
    dev = uio.get("developer", {})
    embed = embed_from_dict("Developer Intelligence", dev, color=0x00AAFF)
    await ctx.send(embed=embed)


# ------------------------------------------------------------
# Agents (Pro tier)
# ------------------------------------------------------------
@bot.command()
async def agents(ctx):
    uio = build_uio()
    agents = uio.get("agents", {})
    embed = embed_from_dict("VolatiAI Agents", agents, color=0xFF8800)
    await ctx.send(embed=embed)


# ------------------------------------------------------------
# Trend Agent
# ------------------------------------------------------------
@bot.command()
async def trend(ctx):
    uio = build_uio()
    trend = uio.get("agents", {}).get("trend", {})
    embed = embed_from_dict("Trend Agent", trend, color=0x33CC33)
    await ctx.send(embed=embed)


# ------------------------------------------------------------
# Whale Agent
# ------------------------------------------------------------
@bot.command()
async def whale(ctx):
    uio = build_uio()
    whale = uio.get("agents", {}).get("whale", {})
    embed = embed_from_dict("Whale Agent", whale, color=0xCC33FF)
    await ctx.send(embed=embed)


# ------------------------------------------------------------
# Spoof Agent
# ------------------------------------------------------------
@bot.command()
async def spoof(ctx):
    uio = build_uio()
    spoof = uio.get("agents", {}).get("spoof", {})
    embed = embed_from_dict("Spoofing Agent", spoof, color=0xFF3333)
    await ctx.send(embed=embed)


# ------------------------------------------------------------
# Narrative Agent
# ------------------------------------------------------------
@bot.command()
async def narrative(ctx):
    uio = build_uio()
    narrative = uio.get("agents", {}).get("narrative", {})
    embed = embed_from_dict("Narrative Agent", narrative, color=0x0099FF)
    await ctx.send(embed=embed)


# ------------------------------------------------------------
# Risk Agent
# ------------------------------------------------------------
@bot.command()
async def risk(ctx):
    uio = build_uio()
    risk = uio.get("agents", {}).get("risk", {})
    embed = embed_from_dict("Risk Agent", risk, color=0xFF0000)
    await ctx.send(embed=embed)


bot.run(TOKEN)
