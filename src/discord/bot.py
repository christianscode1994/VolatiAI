import os
import json
import discord
from discord.ext import commands

TOKEN = os.getenv("DISCORD_TOKEN")

bot = commands.Bot(command_prefix="!", intents=discord.Intents.default())

def load_json(path):
    with open(path, "r") as f:
        return json.load(f)

@bot.command()
async def pro(ctx):
    await ctx.send(
        "**VolatiAI Pro Intelligence Layer**\n"
        "• Trend Acceleration\n"
        "• Narrative Timeline\n"
        "• Whale Pressure\n"
        "• Spoofing Probability\n"
        "• RPC Truth Score"
    )

@bot.command()
async def trend(ctx):
    accel = load_json("private/trends_accel.json")
    await ctx.send(
        "**Trend Acceleration**\n"
        f"Volatility: {accel['volatility_accel']:+.2f}\n"
        f"Sentiment: {accel['sentiment_accel']:+.2f}\n"
        f"Developer Activity: {accel['dsi_accel']:+.2f}"
    )

@bot.command()
async def narratives(ctx):
    hist = load_json("private/narratives_timeline.json")
    curr = hist[-1]
    await ctx.send(
        "**AI/DePIN Narratives**\n"
        f"AI Keywords: {curr['ai_count']}\n"
        f"DePIN Keywords: {curr['depin_count']}"
    )

@bot.command()
async def depth(ctx):
    micro = load_json("private/microstructure.json")
    await ctx.send(
        "**Depth & Microstructure**\n"
        f"Whale Orders: {len(micro['whale_orders'])}\n"
        f"Spoofing Probability: {micro['spoofing_score']:.1f}%"
    )

@bot.command()
async def truth(ctx):
    truth = load_json("private/rpc_truth.json")
    await ctx.send(
        "**RPC Truth Score**\n"
        f"Truth Score: {truth['truth_score']}%"
    )

bot.run(TOKEN)
