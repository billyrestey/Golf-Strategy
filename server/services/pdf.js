import PDFDocument from 'pdfkit';

/**
 * Generates a PDF strategy card from analysis data
 * @param {Object} analysis - The analysis object from Claude
 * @param {Object} userData - User info (name, handicap, course)
 * @returns {Promise<Buffer>} - PDF as buffer
 */
export function generateStrategyPDF(analysis, userData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        darkGreen: '#1a472a',
        lightGreen: '#7cb97c',
        mediumGreen: '#2d5a3d',
        red: '#c44536',
        yellow: '#d4a017',
        green: '#3d8b40',
        gray: '#555555',
        lightGray: '#f7f7f5',
        border: '#e0e0e0'
      };

      const pageWidth = doc.page.width - 100;
      const leftMargin = 50;

      // ========== PAGE 1 ==========

      // Elegant header
      doc.rect(0, 0, doc.page.width, 100).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(28)
         .font('Helvetica-Bold')
         .text(userData.homeCourse?.toUpperCase() || 'COURSE STRATEGY', leftMargin, 30);
      
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('rgba(255,255,255,0.8)')
         .text(`${userData.name} • ${userData.handicap} Handicap • ${new Date().toLocaleDateString()}`, leftMargin, 65);

      let yPos = 130;

      // Key Insight - prominent box
      if (analysis.summary?.keyInsight) {
        doc.rect(leftMargin, yPos, pageWidth, 60)
           .fill(colors.lightGray);
        
        doc.fillColor(colors.darkGreen)
           .fontSize(9)
           .font('Helvetica-Bold')
           .text('KEY INSIGHT', leftMargin + 15, yPos + 12);
        
        doc.fillColor(colors.gray)
           .fontSize(11)
           .font('Helvetica')
           .text(analysis.summary.keyInsight, leftMargin + 15, yPos + 28, { 
             width: pageWidth - 30,
             lineGap: 2
           });
        
        yPos += 80;
      }

      // Traffic Light System - horizontal layout
      doc.fillColor(colors.darkGreen)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('TEE SHOT STRATEGY', leftMargin, yPos);
      
      yPos += 25;

      // Helper to get holes from either format
      const getHoles = (lightData) => {
        if (!lightData) return null;
        if (lightData.holes) {
          return Array.isArray(lightData.holes) ? lightData.holes.join(', ') : lightData.holes;
        }
        return Array.isArray(lightData) ? lightData.join(', ') : lightData;
      };

      const getStrategy = (lightData) => {
        return lightData?.strategy || null;
      };

      const hasLightData = (lightData) => {
        if (!lightData) return false;
        if (lightData.holes) return lightData.holes.length > 0;
        return Array.isArray(lightData) ? lightData.length > 0 : !!lightData;
      };

      // Three column layout for traffic lights
      const colWidth = (pageWidth - 20) / 3;
      const lights = [
        { data: analysis.courseStrategy?.greenLightHoles, color: colors.green, label: 'GREEN LIGHT', subtitle: 'Attack' },
        { data: analysis.courseStrategy?.yellowLightHoles, color: colors.yellow, label: 'YELLOW LIGHT', subtitle: 'Conditional' },
        { data: analysis.courseStrategy?.redLightHoles, color: colors.red, label: 'RED LIGHT', subtitle: 'Play Safe' }
      ];

      lights.forEach((light, i) => {
        if (!hasLightData(light.data)) return;
        
        const x = leftMargin + (i * (colWidth + 10));
        
        // Card background
        doc.rect(x, yPos, colWidth, 100)
           .fill(colors.lightGray);
        
        // Color accent bar
        doc.rect(x, yPos, colWidth, 4).fill(light.color);
        
        // Label
        doc.fillColor(colors.darkGreen)
           .fontSize(8)
           .font('Helvetica-Bold')
           .text(light.label, x + 10, yPos + 14, { width: colWidth - 20, lineBreak: false });
        
        doc.fillColor(colors.gray)
           .fontSize(7)
           .font('Helvetica')
           .text(light.subtitle, x + 10, yPos + 25, { width: colWidth - 20, lineBreak: false });
        
        // Holes
        const holes = getHoles(light.data);
        if (holes) {
          doc.fillColor(colors.darkGreen)
             .fontSize(9)
             .font('Helvetica-Bold')
             .text(holes, x + 10, yPos + 42, { width: colWidth - 20, height: 25, ellipsis: true });
        }
        
        // Strategy (if exists) - truncate to fit
        const strategy = getStrategy(light.data);
        if (strategy) {
          doc.fillColor(colors.gray)
             .fontSize(7)
             .font('Helvetica')
             .text(strategy.substring(0, 120) + (strategy.length > 120 ? '...' : ''), x + 10, yPos + 70, { width: colWidth - 20, height: 28 });
        }
      });

      yPos += 120;

      // Trouble Holes - clean cards (limit to 3, truncate text)
      if (analysis.troubleHoles?.length > 0) {
        doc.fillColor(colors.darkGreen)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('TROUBLE HOLES', leftMargin, yPos, { lineBreak: false });
        
        yPos += 25;

        analysis.troubleHoles.slice(0, 3).forEach((hole, i) => {
          // Card
          doc.rect(leftMargin, yPos, pageWidth, 75)
             .fill(colors.lightGray);
          
          // Red accent
          doc.rect(leftMargin, yPos, 4, 75).fill(colors.red);
          
          // Hole type
          doc.fillColor(colors.darkGreen)
             .fontSize(11)
             .font('Helvetica-Bold')
             .text(hole.type, leftMargin + 15, yPos + 12, { width: pageWidth - 100, lineBreak: false });
          
          // Target score badge
          if (hole.acceptableScore) {
            doc.fillColor(colors.lightGreen)
               .fontSize(8)
               .font('Helvetica-Bold')
               .text(`Target: ${hole.acceptableScore}`, leftMargin + pageWidth - 80, yPos + 12, { width: 70, lineBreak: false });
          }
          
          // Strategy - truncate to fit in card
          const strategyText = hole.strategy?.substring(0, 150) + (hole.strategy?.length > 150 ? '...' : '');
          doc.fillColor(colors.gray)
             .fontSize(9)
             .font('Helvetica')
             .text(strategyText || '', leftMargin + 15, yPos + 32, { width: pageWidth - 40, height: 22 });
          
          // Club recommendation
          if (hole.clubRecommendation) {
            doc.fillColor(colors.mediumGreen)
               .fontSize(8)
               .font('Helvetica-Bold')
               .text(`Club: ${hole.clubRecommendation}`, leftMargin + 15, yPos + 58, { lineBreak: false });
          }
          
          yPos += 85;
        });
      }

      // ========== PAGE 2 ==========
      doc.addPage();
      yPos = 50;

      // Target Stats - large, clean boxes
      if (analysis.targetStats) {
        doc.fillColor(colors.darkGreen)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('YOUR TARGET STATS', leftMargin, yPos, { lineBreak: false });
        
        yPos += 30;

        const stats = [
          { label: 'FAIRWAYS', value: analysis.targetStats.fairwaysHit },
          { label: 'PENALTIES', value: analysis.targetStats.penaltiesPerRound },
          { label: 'GIR', value: analysis.targetStats.gir },
          { label: 'UP & DOWN', value: analysis.targetStats.upAndDown }
        ].filter(s => s.value);

        const statWidth = (pageWidth - 30) / Math.max(stats.length, 1);
        stats.forEach((stat, i) => {
          const x = leftMargin + (i * (statWidth + 10));
          
          doc.rect(x, yPos, statWidth, 70)
             .fill(colors.lightGray);
          
          doc.fillColor(colors.lightGreen)
             .fontSize(28)
             .font('Helvetica-Bold')
             .text(stat.value || '', x, yPos + 12, { width: statWidth, align: 'center', lineBreak: false });
          
          doc.fillColor(colors.gray)
             .fontSize(8)
             .font('Helvetica')
             .text(stat.label, x, yPos + 50, { width: statWidth, align: 'center', lineBreak: false });
        });

        yPos += 100;
      }

      // Mental Game Section
      if (analysis.mentalGame) {
        doc.fillColor(colors.darkGreen)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('MENTAL GAME', leftMargin, yPos, { lineBreak: false });
        
        yPos += 30;

        // Pre-shot thought
        if (analysis.mentalGame.preShot) {
          doc.rect(leftMargin, yPos, pageWidth, 50)
             .fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 50).fill(colors.lightGreen);
          
          doc.fillColor(colors.mediumGreen)
             .fontSize(8)
             .font('Helvetica-Bold')
             .text('PRE-SHOT THOUGHT', leftMargin + 15, yPos + 10, { lineBreak: false });
          
          const preShotText = analysis.mentalGame.preShot?.substring(0, 100) || '';
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica')
             .text(preShotText, leftMargin + 15, yPos + 28, { width: pageWidth - 40, height: 18 });
          
          yPos += 65;
        }

        // Recovery thought
        if (analysis.mentalGame.recovery) {
          doc.rect(leftMargin, yPos, pageWidth, 50)
             .fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 50).fill(colors.yellow);
          
          doc.fillColor(colors.mediumGreen)
             .fontSize(8)
             .font('Helvetica-Bold')
             .text('AFTER A BAD SHOT', leftMargin + 15, yPos + 10, { lineBreak: false });
          
          const recoveryText = analysis.mentalGame.recovery?.substring(0, 100) || '';
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica')
             .text(recoveryText, leftMargin + 15, yPos + 28, { width: pageWidth - 40, height: 18 });
          
          yPos += 65;
        }

        // Mantras - limit to 3 to stay on page
        if (analysis.mentalGame.mantras?.length > 0) {
          doc.fillColor(colors.darkGreen)
             .fontSize(10)
             .font('Helvetica-Bold')
             .text('MANTRAS TO REMEMBER', leftMargin, yPos, { lineBreak: false });
          
          yPos += 20;

          analysis.mentalGame.mantras.slice(0, 3).forEach((mantra, i) => {
            doc.circle(leftMargin + 8, yPos + 6, 4).fill(colors.lightGreen);
            
            const mantraText = mantra?.substring(0, 60) || '';
            doc.fillColor(colors.gray)
               .fontSize(10)
               .font('Helvetica-Oblique')
               .text(`"${mantraText}"`, leftMargin + 25, yPos, { width: pageWidth - 40, lineBreak: false });
            
            yPos += 28;
          });
        }
      }

      // Footer - fixed position at bottom of page 2
      const footerY = doc.page.height - 80;
      doc.rect(0, footerY, doc.page.width, 80).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(9)
         .font('Helvetica-Bold')
         .text('ROUND FOCUS:', leftMargin, footerY + 20, { lineBreak: false });
      
      const roundFocus = (analysis.courseStrategy?.overallApproach || 
                         analysis.mentalGame?.preShot || 
                         'Play smart, trust your process, commit to every shot.').substring(0, 120);
      doc.font('Helvetica')
         .fontSize(10)
         .text(roundFocus, leftMargin, footerY + 35, { width: pageWidth, height: 18 });
      
      doc.fontSize(8)
         .fillColor('rgba(255,255,255,0.6)')
         .text('Generated by Golf Strategy • golfstrategy.app', leftMargin, footerY + 58, { lineBreak: false });

      // ========== PAGE 3: HOLE-BY-HOLE STRATEGY ==========
      if (analysis.holeByHoleStrategy?.length > 0) {
        doc.addPage();

        // Header - taller to accommodate content
        doc.rect(0, 0, doc.page.width, 85).fill(colors.darkGreen);

        // Truncate course name if too long
        const courseName = (userData.homeCourse || 'COURSE STRATEGY').toUpperCase();
        const displayName = courseName.length > 35 ? courseName.substring(0, 35) + '...' : courseName;

        doc.fillColor('white')
           .fontSize(18)
           .font('Helvetica-Bold')
           .text(displayName, leftMargin, 15, { width: pageWidth, lineBreak: false });

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('rgba(255,255,255,0.8)')
           .text(`Course Strategy Card — ${userData.name} — ${new Date().getFullYear()} Season`, leftMargin, 38, { lineBreak: false });

        // Truncate key insight
        const keyInsight = (analysis.summary?.keyInsight || 'Play smart golf').substring(0, 50);
        doc.fontSize(8)
           .text(`GOAL: ${analysis.summary?.currentHandicap || userData.handicap} → ${analysis.summary?.targetHandicap || '?'} | KEY: ${keyInsight}...`, leftMargin, 55, { width: pageWidth, lineBreak: false });

        let yPos = 95;

        // Legend row
        doc.fillColor(colors.darkGreen)
           .fontSize(8)
           .font('Helvetica-Bold')
           .text('TEE SHOT:', leftMargin, yPos, { lineBreak: false });

        doc.circle(leftMargin + 55, yPos + 4, 5).fill(colors.green);
        doc.fillColor(colors.darkGreen)
           .text('Driver OK', leftMargin + 65, yPos, { lineBreak: false });

        doc.circle(leftMargin + 125, yPos + 4, 5).fill(colors.yellow);
        doc.fillColor(colors.darkGreen)
           .text('Conditional', leftMargin + 135, yPos, { lineBreak: false });

        doc.circle(leftMargin + 205, yPos + 4, 5).fill(colors.red);
        doc.fillColor(colors.darkGreen)
           .text('3-Hybrid/Iron Only', leftMargin + 215, yPos, { lineBreak: false });

        yPos = 115;

        // Table header - adjusted column widths for better layout
        const colWidths = { hole: 30, par: 55, tee: 90, strategy: 210, notes: 125 };

        doc.rect(leftMargin, yPos, pageWidth, 20).fill(colors.lightGray);
        doc.fillColor(colors.darkGreen)
           .fontSize(8)
           .font('Helvetica-Bold');

        let xPos = leftMargin + 5;
        doc.text('HOLE', xPos, yPos + 6, { lineBreak: false });
        xPos += colWidths.hole;
        doc.text('PAR/YDS', xPos, yPos + 6, { lineBreak: false });
        xPos += colWidths.par;
        doc.text('TEE SHOT', xPos, yPos + 6, { lineBreak: false });
        xPos += colWidths.tee;
        doc.text('STRATEGY', xPos, yPos + 6, { lineBreak: false });
        xPos += colWidths.strategy;
        doc.text('NOTES', xPos, yPos + 6, { lineBreak: false });

        yPos += 25;

        // Build hole averages lookup from extractedScores if available
        const holeAverages = {};
        if (analysis.extractedScores?.rounds?.length > 0) {
          analysis.extractedScores.rounds.forEach(round => {
            if (round.holes) {
              round.holes.forEach(hole => {
                if (hole.hole && hole.score) {
                  if (!holeAverages[hole.hole]) {
                    holeAverages[hole.hole] = { total: 0, count: 0, par: hole.par };
                  }
                  holeAverages[hole.hole].total += hole.score;
                  holeAverages[hole.hole].count++;
                }
              });
            }
          });
          // Calculate averages
          Object.keys(holeAverages).forEach(h => {
            const data = holeAverages[h];
            if (data.count > 0) {
              data.avg = (data.total / data.count).toFixed(1);
              data.vspar = (data.avg - data.par).toFixed(1);
            }
          });
        }

        // Hole rows - Front 9
        const front9 = analysis.holeByHoleStrategy.slice(0, 9);
        const back9 = analysis.holeByHoleStrategy.slice(9, 18);

        const drawHoleRow = (hole, y) => {
          const rowHeight = 34;
          const isOdd = hole.hole % 2 === 1;

          // Alternate row background
          if (isOdd) {
            doc.rect(leftMargin, y, pageWidth, rowHeight).fill('#fafaf8');
          }

          // Light indicator
          const lightColor = hole.light === 'red' ? colors.red :
                            hole.light === 'yellow' ? colors.yellow : colors.green;
          doc.circle(leftMargin + 18, y + rowHeight/2, 6).fill(lightColor);

          doc.fillColor(colors.darkGreen).fontSize(9).font('Helvetica-Bold');

          let x = leftMargin + 5;

          // Hole number
          doc.text(hole.hole.toString(), x + 22, y + 10, { lineBreak: false });
          x += colWidths.hole;

          // Par/Yards
          doc.font('Helvetica')
             .fontSize(8)
             .text(`Par ${hole.par}`, x, y + 6, { lineBreak: false });
          doc.fillColor(colors.gray)
             .fontSize(7)
             .text(`${hole.yards || '---'} yds`, x, y + 17, { lineBreak: false });
          x += colWidths.par;

          // Tee shot - show club recommendation
          const teeShot = (hole.teeShot || 'Driver').substring(0, 18);
          doc.fillColor(colors.darkGreen)
             .fontSize(8)
             .font('Helvetica-Bold')
             .text(teeShot, x, y + 10, { lineBreak: false });
          x += colWidths.tee;

          // Strategy - combine main strategy with approach if available
          let strategyText = hole.strategy || '';
          if (hole.approachStrategy && strategyText.length < 40) {
            strategyText += ' ' + hole.approachStrategy;
          }
          doc.fillColor(colors.gray)
             .fontSize(7)
             .font('Helvetica')
             .text(strategyText.substring(0, 70), x, y + 4, { width: colWidths.strategy - 10, height: 26 });
          x += colWidths.strategy;

          // Notes - Include historical average if available
          let notesText = hole.notes || '';
          const holeAvg = holeAverages[hole.hole];
          if (holeAvg?.avg) {
            const vsPar = parseFloat(holeAvg.vspar);
            let perfNote = '';
            if (vsPar <= -0.3) {
              perfNote = `${holeAvg.avg} avg - birdie opp`;
            } else if (vsPar <= 0.2) {
              perfNote = `${holeAvg.avg} avg - solid hole`;
            } else if (vsPar <= 0.7) {
              perfNote = `${holeAvg.avg} avg - stay focused`;
            } else {
              perfNote = `${holeAvg.avg} avg - trouble spot`;
            }
            notesText = perfNote + (notesText ? ' • ' + notesText : '');
          }

          doc.fillColor(colors.mediumGreen)
             .fontSize(7)
             .font('Helvetica-Oblique')
             .text(notesText.substring(0, 45), x, y + 4, { width: colWidths.notes - 5, height: 26 });

          return rowHeight;
        };

        // Front 9
        front9.forEach((hole, i) => {
          const rowHeight = drawHoleRow(hole, yPos);
          yPos += rowHeight;
        });

        // Turn divider
        yPos += 3;
        doc.rect(leftMargin, yPos, pageWidth, 18).fill(colors.darkGreen);
        doc.fillColor('white')
           .fontSize(9)
           .font('Helvetica-Bold')
           .text('BACK 9', leftMargin + pageWidth/2 - 20, yPos + 4, { lineBreak: false });
        yPos += 21;

        // Back 9
        back9.forEach((hole, i) => {
          const rowHeight = drawHoleRow(hole, yPos);
          yPos += rowHeight;
        });

        // Bottom section - ensure it fits
        const remainingSpace = doc.page.height - yPos - 50;
        if (remainingSpace >= 60) {
          yPos += 8;
          doc.rect(leftMargin, yPos, pageWidth, 28).fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 28).fill(colors.lightGreen);

          const mantra = analysis.mentalGame?.mantras?.[0] ||
                        analysis.courseStrategy?.overallApproach ||
                        'Play to your strengths. Trust your swing.';
          doc.fillColor(colors.darkGreen)
             .fontSize(8)
             .font('Helvetica-Bold')
             .text('FOCUS:', leftMargin + 15, yPos + 8, { lineBreak: false });
          doc.fillColor(colors.gray)
             .fontSize(9)
             .font('Helvetica-Oblique')
             .text(`"${mantra.substring(0, 85)}"`, leftMargin + 60, yPos + 8, { width: pageWidth - 90, lineBreak: false });

          // Bottom targets
          yPos += 32;
          const par3Target = analysis.targetStats?.par3Average || '';
          const par5Target = analysis.targetStats?.par5Average || '';
          let targetLine = `Targets: ${analysis.targetStats?.fairwaysHit || '40%'} FW | ${analysis.targetStats?.gir || '25%'} GIR | ${analysis.targetStats?.penaltiesPerRound || '<2'} penalties`;
          if (par3Target || par5Target) {
            targetLine += ` | Par 3s: ${par3Target || '-'} | Par 5s: ${par5Target || '-'}`;
          }

          doc.fillColor(colors.gray)
             .fontSize(7)
             .font('Helvetica')
             .text(targetLine, leftMargin, yPos, { width: pageWidth, align: 'center', lineBreak: false });
        }
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generates a detailed practice plan PDF - Clean 2-page layout
 */
export function generatePracticePlanPDF(analysis, userData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        darkGreen: '#1a472a',
        lightGreen: '#7cb97c',
        mediumGreen: '#2d5a3d',
        gray: '#555555',
        lightGray: '#f7f7f5'
      };

      const pageWidth = doc.page.width - 100;
      const leftMargin = 50;

      // ========== PAGE 1 ==========
      
      // Header
      doc.rect(0, 0, doc.page.width, 100).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(28)
         .font('Helvetica-Bold')
         .text('PRACTICE PLAN', leftMargin, 30);
      
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('rgba(255,255,255,0.8)')
         .text(`${userData.name} • Tailored for ${userData.missPattern || 'your'} miss pattern`, leftMargin, 65);

      let yPos = 130;

      // Weekly Schedule - limit to first 2 sessions on page 1
      if (analysis.practicePlan?.weeklySchedule?.length > 0) {
        const sessions = analysis.practicePlan.weeklySchedule.slice(0, 2);
        
        sessions.forEach((session, sessionIndex) => {
          // Session header card
          doc.rect(leftMargin, yPos, pageWidth, 40)
             .fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 40).fill(colors.lightGreen);
          
          // Session name
          doc.fillColor(colors.darkGreen)
             .fontSize(14)
             .font('Helvetica-Bold')
             .text(session.session, leftMargin + 15, yPos + 8);
          
          // Duration - positioned on the right
          doc.fillColor(colors.lightGreen)
             .fontSize(11)
             .font('Helvetica')
             .text(session.duration, leftMargin + pageWidth - 80, yPos + 10, { width: 70, align: 'right' });
          
          // Focus text
          if (session.focus) {
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica-Oblique')
               .text(session.focus, leftMargin + 15, yPos + 26, { width: pageWidth - 100 });
          }
          
          yPos += 55;

          // Drills - limit to 2 per session
          const drills = session.drills?.slice(0, 2) || [];
          drills.forEach((drill, drillIndex) => {
            doc.rect(leftMargin, yPos, pageWidth, 65)
               .fill(colors.lightGray);
            
            // Drill name
            doc.fillColor(colors.darkGreen)
               .fontSize(11)
               .font('Helvetica-Bold')
               .text(drill.name || '', leftMargin + 15, yPos + 10, { width: pageWidth - 100, lineBreak: false });
            
            // Reps badge
            if (drill.reps) {
              doc.fillColor(colors.lightGreen)
                 .fontSize(9)
                 .font('Helvetica-Bold')
                 .text(drill.reps, leftMargin + pageWidth - 80, yPos + 10, { width: 70, align: 'right', lineBreak: false });
            }
            
            // Description - truncate
            const descText = drill.description?.substring(0, 100) || '';
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica')
               .text(descText, leftMargin + 15, yPos + 28, { width: pageWidth - 40, height: 16 });
            
            // Why (if exists) - truncate
            if (drill.why) {
              const whyText = drill.why?.substring(0, 80) || '';
              doc.fillColor(colors.mediumGreen)
                 .fontSize(8)
                 .font('Helvetica-Oblique')
                 .text(`Why: ${whyText}`, leftMargin + 15, yPos + 48, { width: pageWidth - 40, lineBreak: false });
            }
            
            yPos += 75;
          });

          yPos += 20;
        });
      }

      // ========== PAGE 2 ==========
      doc.addPage();
      yPos = 50;

      // Remaining sessions (if any)
      if (analysis.practicePlan?.weeklySchedule?.length > 2) {
        const remainingSessions = analysis.practicePlan.weeklySchedule.slice(2, 4);
        
        remainingSessions.forEach((session, sessionIndex) => {
          // Session header card
          doc.rect(leftMargin, yPos, pageWidth, 40)
             .fill(colors.lightGray);
          doc.rect(leftMargin, yPos, 4, 40).fill(colors.lightGreen);
          
          doc.fillColor(colors.darkGreen)
             .fontSize(14)
             .font('Helvetica-Bold')
             .text(session.session, leftMargin + 15, yPos + 8);
          
          doc.fillColor(colors.lightGreen)
             .fontSize(11)
             .font('Helvetica')
             .text(session.duration, leftMargin + pageWidth - 80, yPos + 10, { width: 70, align: 'right' });
          
          if (session.focus) {
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica-Oblique')
               .text(session.focus, leftMargin + 15, yPos + 26, { width: pageWidth - 100 });
          }
          
          yPos += 55;

          const drills = session.drills?.slice(0, 2) || [];
          drills.forEach((drill) => {
            doc.rect(leftMargin, yPos, pageWidth, 65)
               .fill(colors.lightGray);
            
            doc.fillColor(colors.darkGreen)
               .fontSize(11)
               .font('Helvetica-Bold')
               .text(drill.name || '', leftMargin + 15, yPos + 10, { width: pageWidth - 100, lineBreak: false });
            
            if (drill.reps) {
              doc.fillColor(colors.lightGreen)
                 .fontSize(9)
                 .font('Helvetica-Bold')
                 .text(drill.reps, leftMargin + pageWidth - 80, yPos + 10, { width: 70, align: 'right', lineBreak: false });
            }
            
            const descText = drill.description?.substring(0, 100) || '';
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica')
               .text(descText, leftMargin + 15, yPos + 28, { width: pageWidth - 40, height: 16 });
            
            if (drill.why) {
              const whyText = drill.why?.substring(0, 80) || '';
              doc.fillColor(colors.mediumGreen)
                 .fontSize(8)
                 .font('Helvetica-Oblique')
                 .text(`Why: ${whyText}`, leftMargin + 15, yPos + 48, { width: pageWidth - 40, lineBreak: false });
            }
            
            yPos += 75;
          });

          yPos += 20;
        });
      }

      // Pre-Round Routine
      if (analysis.practicePlan?.preRoundRoutine?.length > 0) {
        yPos += 10;
        
        doc.fillColor(colors.darkGreen)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('PRE-ROUND ROUTINE', leftMargin, yPos, { lineBreak: false });
        
        yPos += 30;

        analysis.practicePlan.preRoundRoutine.slice(0, 5).forEach((step, i) => {
          // Number circle
          doc.circle(leftMargin + 12, yPos + 8, 12)
             .fill(colors.lightGreen);
          
          doc.fillColor('white')
             .fontSize(11)
             .font('Helvetica-Bold')
             .text((i + 1).toString(), leftMargin + 8, yPos + 3, { lineBreak: false });
          
          // Step text - truncate
          const stepText = step?.substring(0, 80) || '';
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica')
             .text(stepText, leftMargin + 35, yPos + 2, { width: pageWidth - 50, lineBreak: false });
          
          yPos += 35;
        });
      }

      // Footer - fixed at bottom
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY, doc.page.width, 60).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(8)
         .font('Helvetica')
         .text('Generated by Golf Strategy • golfstrategy.app', leftMargin, footerY + 25, { lineBreak: false });

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}
