const { EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../json/farm-animals.json');

async function checkLoanPayments(client, db) {
    if (!db) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const activeLoansRes = await db.query("SELECT * FROM user_loans WHERE remainingamount > 0 AND (lastpaymentdate + $1) <= $2", [ONE_DAY, now]);
    const activeLoans = activeLoansRes.rows;

    if (activeLoans.length === 0) return;

    for (const loan of activeLoans) {
        try {
            const guild = client.guilds.cache.get(loan.guildid);
            if (!guild) continue;

            let userDataRes = await db.query("SELECT * FROM levels WHERE userid = $1 AND guildid = $2", [loan.userid, loan.guildid]);
            let userData = userDataRes.rows[0];
            
            if (!userData) continue; 

            const member = await guild.members.fetch(loan.userid).catch(() => null);

            const paymentAmount = Math.min(loan.dailypayment, loan.remainingamount);
            let remainingToPay = paymentAmount; 
            let deductionDetails = ""; 
            
            const EMOJI_MORA = client.EMOJI_MORA || '🪙'; 

            if (userData.mora > 0) {
                const takeMora = Math.min(userData.mora, remainingToPay);
                userData.mora -= takeMora;
                remainingToPay -= takeMora;
                
                if (takeMora > 0) {
                    deductionDetails += `💸 **خصم مورا:** تم استقطاع **${takeMora.toLocaleString()}** ${EMOJI_MORA}\n`;
                }
            }

            if (remainingToPay > 0 && userData.bank > 0) {
                const takeBank = Math.min(userData.bank, remainingToPay);
                userData.bank -= takeBank;
                remainingToPay -= takeBank;

                if (takeBank > 0) {
                     deductionDetails += `💳 **خصم بنكي:** تم سحب **${takeBank.toLocaleString()}** ${EMOJI_MORA}\n`;
                }
            }

            if (remainingToPay > 0) {
                 const portfolioRes = await db.query("SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2", [loan.userid, loan.guildid]);
                 const portfolio = portfolioRes.rows;
                 
                 for (const item of portfolio) {
                     if (remainingToPay <= 0) break; 

                     const marketDataRes = await db.query("SELECT currentprice, name FROM market_items WHERE id = $1", [item.itemid]);
                     const marketData = marketDataRes.rows[0];
                     if (!marketData) continue; 

                     const price = marketData.currentprice;
                     const neededQty = Math.ceil(remainingToPay / price);
                     const sellQty = Math.min(item.quantity, neededQty);
                     const value = sellQty * price;
                     
                     if (sellQty >= item.quantity) {
                         await db.query("DELETE FROM user_portfolio WHERE id = $1", [item.id]);
                     } else {
                         await db.query("UPDATE user_portfolio SET quantity = quantity - $1 WHERE id = $2", [sellQty, item.id]);
                     }
                     
                     if (value > remainingToPay) {
                         const change = value - remainingToPay;
                         userData.mora += change; 
                         remainingToPay = 0;
                     } else {
                         remainingToPay -= value;
                     }

                     deductionDetails += `📉 **تسييل أصول:** تم بيع **${sellQty}x ${marketData.name}**\n`;
                 }
            }

            if (remainingToPay > 0) {
                 const farmRes = await db.query("SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2", [loan.userid, loan.guildid]);
                 const farm = farmRes.rows;
                 
                 for (const animalRow of farm) {
                     if (remainingToPay <= 0) break;

                     const animalData = farmAnimals.find(a => a.id === animalRow.animalid);
                     if (!animalData) continue;

                     const price = animalData.price; 
                     
                     await db.query("DELETE FROM user_farm WHERE id = $1", [animalRow.id]);

                     if (price > remainingToPay) {
                         const change = price - remainingToPay;
                         userData.mora += change;
                         remainingToPay = 0;
                     } else {
                         remainingToPay -= price;
                     }

                     deductionDetails += `🚜 **بيع مزرعة:** تم مصادرة **${animalData.name}**\n`;
                 }
            }

            if (remainingToPay > 0) {
                const xpPenalty = Math.floor(remainingToPay * 2);
                
                if (userData.xp >= xpPenalty) {
                    userData.xp -= xpPenalty; 
                } else { 
                    userData.xp = 0; 
                    if (userData.level > 1) userData.level -= 1; 
                }
                
                deductionDetails += `⚠️ **عقوبة تعثر:** تم خصم **${xpPenalty.toLocaleString()}** XP لعدم كفاية الأصول\n`;
                remainingToPay = 0; 
            }

            await db.query("UPDATE levels SET mora = $1, bank = $2, xp = $3, level = $4 WHERE userid = $5 AND guildid = $6", [userData.mora, userData.bank, userData.xp, userData.level, loan.userid, loan.guildid]);
            
            loan.remainingamount -= paymentAmount; 
            
            if (loan.remainingamount < 0) loan.remainingamount = 0;

            if (loan.remainingamount <= 0) {
                await db.query("DELETE FROM user_loans WHERE userid = $1 AND guildid = $2", [loan.userid, loan.guildid]);
                deductionDetails += `\n🎉 **تم سداد القرض بالكامل!**`;
            } else {
                await db.query("UPDATE user_loans SET remainingamount = $1, lastpaymentdate = $2 WHERE userid = $3 AND guildid = $4", [loan.remainingamount, now, loan.userid, loan.guildid]);
            }

            if (!member) continue; 

            const settingsRes = await db.query("SELECT casinochannelid FROM settings WHERE guild = $1", [guild.id]);
            const settings = settingsRes.rows[0];
            
            if (settings && settings.casinochannelid) {
                const channel = guild.channels.cache.get(settings.casinochannelid);
                if (channel && deductionDetails) {
                    
                    const daysLeft = Math.ceil(loan.remainingamount / loan.dailypayment);

                    const embed = new EmbedBuilder()
                        .setTitle(`❖ إشـعـار سـداد القـرض`)
                        .setColor(remainingToPay > 0 ? Colors.Red : Colors.Gold) 
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .setImage('https://i.postimg.cc/vmrBxCqF/download-(1).gif')
                        .setDescription(
                            `**📊 موقف القرض:**\n` +
                            `• المبلغ المستقطع: **${paymentAmount.toLocaleString()}** ${EMOJI_MORA}\n` +
                            `• المتبقي من الدين: **${loan.remainingamount.toLocaleString()}** ${EMOJI_MORA}\n` +
                            `• الأقساط المتبقية: **${daysLeft}** يوم تقريباً\n\n` +
                            `**🧾 تفاصيل العملية:**\n${deductionDetails}`
                        )
                        .setFooter({ text: "يتم الخصم تلقائياً كل 24 ساعة" })
                        .setTimestamp();

                    await channel.send({ content: `<@${loan.userid}>`, embeds: [embed] }).catch(() => {});
                    
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

        } catch (err) {
            console.error(`[Loan Error] User: ${loan.userid}`, err);
        }
    }
}

module.exports = { checkLoanPayments };
