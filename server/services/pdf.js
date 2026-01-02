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
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        darkGreen: '#1a472a',
        lightGreen: '#7cb97c',
        red: '#c44536',
        yellow: '#d4a017',
        green: '#3d8b40',
        gray: '#666666',
        lightGray: '#f5f5f5'
      };

      const pageWidth = doc.page.width - 80;

      // Header
      doc.rect(0, 0, doc.page.width, 80).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text(userData.homeCourse?.toUpperCase() || 'COURSE STRATEGY', 40, 25);
      
      doc.fontSize(12)
         .font('Helvetica')
         .text(`${userData.name} • ${userData.handicap} Handicap • ${new Date().toLocaleDateString()}`, 40, 52);

      // Key Insight
      if (analysis.summary?.keyInsight) {
        doc.fillColor(colors.darkGreen)
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('KEY INSIGHT', 40, 100);
        
        doc.fillColor(colors.gray)
           .fontSize(10)
           .font('Helvetica')
           .text(analysis.summary.keyInsight, 40, 115, { width: pageWidth });
      }

      let yPos = 145;

      // Traffic Light Legend
      doc.fillColor(colors.darkGreen)
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('TEE SHOT STRATEGY', 40, yPos);
      
      yPos += 18;

      // Legend items
      const legendItems = [
        { color: colors.green, label: 'Driver OK' },
        { color: colors.yellow, label: 'Conditional' },
        { color: colors.red, label: '3-Hybrid Only' }
      ];

      let xPos = 40;
      legendItems.forEach(item => {
        doc.circle(xPos + 5, yPos + 5, 5).fill(item.color);
        doc.fillColor(colors.gray)
           .fontSize(9)
           .font('Helvetica')
           .text(item.label, xPos + 15, yPos + 1);
        xPos += 100;
      });

      yPos += 30;

      // Course Strategy Section
      if (analysis.courseStrategy) {
        // Red Light Holes
        if (analysis.courseStrategy.redLightHoles?.length > 0) {
          doc.circle(45, yPos + 5, 5).fill(colors.red);
          doc.fillColor(colors.darkGreen)
             .fontSize(10)
             .font('Helvetica-Bold')
             .text('RED LIGHT — Play Safe', 55, yPos);
          
          yPos += 15;
          const redText = Array.isArray(analysis.courseStrategy.redLightHoles) 
            ? analysis.courseStrategy.redLightHoles.join(', ')
            : analysis.courseStrategy.redLightHoles;
          
          doc.fillColor(colors.gray)
             .fontSize(9)
             .font('Helvetica')
             .text(redText, 55, yPos, { width: pageWidth - 20 });
          
          yPos += doc.heightOfString(redText, { width: pageWidth - 20 }) + 15;
        }

        // Yellow Light Holes
        if (analysis.courseStrategy.yellowLightHoles?.length > 0) {
          doc.circle(45, yPos + 5, 5).fill(colors.yellow);
          doc.fillColor(colors.darkGreen)
             .fontSize(10)
             .font('Helvetica-Bold')
             .text('YELLOW LIGHT — Conditional', 55, yPos);
          
          yPos += 15;
          const yellowText = Array.isArray(analysis.courseStrategy.yellowLightHoles)
            ? analysis.courseStrategy.yellowLightHoles.join(', ')
            : analysis.courseStrategy.yellowLightHoles;
          
          doc.fillColor(colors.gray)
             .fontSize(9)
             .font('Helvetica')
             .text(yellowText, 55, yPos, { width: pageWidth - 20 });
          
          yPos += doc.heightOfString(yellowText, { width: pageWidth - 20 }) + 15;
        }

        // Green Light Holes
        if (analysis.courseStrategy.greenLightHoles?.length > 0) {
          doc.circle(45, yPos + 5, 5).fill(colors.green);
          doc.fillColor(colors.darkGreen)
             .fontSize(10)
             .font('Helvetica-Bold')
             .text('GREEN LIGHT — Attack', 55, yPos);
          
          yPos += 15;
          const greenText = Array.isArray(analysis.courseStrategy.greenLightHoles)
            ? analysis.courseStrategy.greenLightHoles.join(', ')
            : analysis.courseStrategy.greenLightHoles;
          
          doc.fillColor(colors.gray)
             .fontSize(9)
             .font('Helvetica')
             .text(greenText, 55, yPos, { width: pageWidth - 20 });
          
          yPos += doc.heightOfString(greenText, { width: pageWidth - 20 }) + 20;
        }
      }

      // Trouble Holes Detail
      if (analysis.troubleHoles?.length > 0) {
        doc.fillColor(colors.darkGreen)
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('TROUBLE HOLES — STRATEGIES', 40, yPos);
        
        yPos += 18;

        analysis.troubleHoles.slice(0, 3).forEach((hole, i) => {
          doc.rect(40, yPos, pageWidth, 3).fill(colors.red);
          yPos += 8;
          
          doc.fillColor(colors.darkGreen)
             .fontSize(10)
             .font('Helvetica-Bold')
             .text(hole.type, 40, yPos);
          
          yPos += 14;
          
          doc.fillColor(colors.gray)
             .fontSize(9)
             .font('Helvetica')
             .text(`Strategy: ${hole.strategy}`, 40, yPos, { width: pageWidth });
          
          yPos += doc.heightOfString(`Strategy: ${hole.strategy}`, { width: pageWidth }) + 5;
          
          if (hole.clubRecommendation) {
            doc.text(`Club: ${hole.clubRecommendation}`, 40, yPos);
            yPos += 12;
          }
          
          doc.fillColor(colors.lightGreen)
             .text(`Target: ${hole.acceptableScore}`, 40, yPos);
          
          yPos += 20;
        });
      }

      // Check if we need a new page
      if (yPos > 600) {
        doc.addPage();
        yPos = 40;
      }

      // Target Stats
      if (analysis.targetStats) {
        doc.fillColor(colors.darkGreen)
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('TARGET STATS', 40, yPos);
        
        yPos += 20;

        const stats = [
          { label: 'Fairways', value: analysis.targetStats.fairwaysHit },
          { label: 'Penalties', value: analysis.targetStats.penaltiesPerRound },
          { label: 'GIR', value: analysis.targetStats.gir },
          { label: 'Up & Down', value: analysis.targetStats.upAndDown }
        ].filter(s => s.value);

        const statWidth = pageWidth / stats.length;
        stats.forEach((stat, i) => {
          const x = 40 + (i * statWidth);
          
          doc.rect(x, yPos, statWidth - 10, 50)
             .fill(colors.lightGray);
          
          doc.fillColor(colors.lightGreen)
             .fontSize(18)
             .font('Helvetica-Bold')
             .text(stat.value, x, yPos + 10, { width: statWidth - 10, align: 'center' });
          
          doc.fillColor(colors.gray)
             .fontSize(8)
             .font('Helvetica')
             .text(stat.label.toUpperCase(), x, yPos + 35, { width: statWidth - 10, align: 'center' });
        });

        yPos += 70;
      }

      // Mental Mantras
      if (analysis.mentalGame?.mantras?.length > 0) {
        doc.fillColor(colors.darkGreen)
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('MENTAL MANTRAS', 40, yPos);
        
        yPos += 18;

        analysis.mentalGame.mantras.slice(0, 3).forEach((mantra, i) => {
          doc.rect(40, yPos, 3, 25).fill(colors.lightGreen);
          
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica-Oblique')
             .text(`"${mantra}"`, 50, yPos + 5, { width: pageWidth - 20 });
          
          yPos += 30;
        });
      }

      // Footer
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY, doc.page.width, 60).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('MANTRA:', 40, footerY + 15);
      
      const preShot = analysis.mentalGame?.preShot || 'Fairway finder on trouble holes. Swing free, not hard. Trust the short game.';
      doc.font('Helvetica')
         .text(preShot, 95, footerY + 15, { width: pageWidth - 60 });
      
      doc.fontSize(8)
         .text('Generated by Fairway Strategy • fairwaystrategy.com', 40, footerY + 40);

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generates a detailed practice plan PDF
 */
export function generatePracticePlanPDF(analysis, userData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        darkGreen: '#1a472a',
        lightGreen: '#7cb97c',
        gray: '#666666',
        lightGray: '#f5f5f5'
      };

      const pageWidth = doc.page.width - 80;

      // Header
      doc.rect(0, 0, doc.page.width, 80).fill(colors.darkGreen);
      
      doc.fillColor('white')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('PRACTICE PLAN', 40, 25);
      
      doc.fontSize(12)
         .font('Helvetica')
         .text(`${userData.name} • Tailored for ${userData.missPattern || 'your'} miss pattern`, 40, 52);

      let yPos = 100;

      // Weekly Schedule
      if (analysis.practicePlan?.weeklySchedule?.length > 0) {
        analysis.practicePlan.weeklySchedule.forEach((session, sessionIndex) => {
          if (yPos > 650) {
            doc.addPage();
            yPos = 40;
          }

          doc.fillColor(colors.darkGreen)
             .fontSize(14)
             .font('Helvetica-Bold')
             .text(session.session, 40, yPos);
          
          doc.fillColor(colors.lightGreen)
             .fontSize(10)
             .font('Helvetica')
             .text(session.duration, 40 + doc.widthOfString(session.session) + 10, yPos + 2);
          
          yPos += 20;

          if (session.focus) {
            doc.fillColor(colors.gray)
               .fontSize(10)
               .font('Helvetica-Oblique')
               .text(session.focus, 40, yPos, { width: pageWidth });
            yPos += 18;
          }

          session.drills?.forEach((drill, drillIndex) => {
            if (yPos > 680) {
              doc.addPage();
              yPos = 40;
            }

            doc.rect(40, yPos, pageWidth, 70)
               .fill(colors.lightGray);
            
            doc.fillColor(colors.darkGreen)
               .fontSize(11)
               .font('Helvetica-Bold')
               .text(drill.name, 50, yPos + 10);
            
            doc.fillColor(colors.lightGreen)
               .fontSize(9)
               .text(drill.reps, pageWidth - 30, yPos + 10, { align: 'right' });
            
            doc.fillColor(colors.gray)
               .fontSize(9)
               .font('Helvetica')
               .text(drill.description, 50, yPos + 28, { width: pageWidth - 30 });
            
            if (drill.why) {
              doc.fillColor(colors.lightGreen)
                 .fontSize(8)
                 .font('Helvetica-Oblique')
                 .text(`Why: ${drill.why}`, 50, yPos + 52, { width: pageWidth - 30 });
            }
            
            yPos += 80;
          });

          yPos += 20;
        });
      }

      // Pre-Round Routine
      if (analysis.practicePlan?.preRoundRoutine?.length > 0) {
        if (yPos > 550) {
          doc.addPage();
          yPos = 40;
        }

        doc.fillColor(colors.darkGreen)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('PRE-ROUND ROUTINE', 40, yPos);
        
        yPos += 25;

        analysis.practicePlan.preRoundRoutine.forEach((step, i) => {
          doc.circle(50, yPos + 5, 10)
             .fill(colors.lightGreen);
          
          doc.fillColor('white')
             .fontSize(10)
             .font('Helvetica-Bold')
             .text((i + 1).toString(), 47, yPos + 1);
          
          doc.fillColor(colors.gray)
             .fontSize(10)
             .font('Helvetica')
             .text(step, 70, yPos, { width: pageWidth - 40 });
          
          yPos += 25;
        });
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}
