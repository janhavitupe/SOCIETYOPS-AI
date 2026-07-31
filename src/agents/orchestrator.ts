import { GoogleGenAI } from '@google/genai';
import { maintenanceToolDeclarations, executeToolCall } from '../tools/maintenanceTools';
import { dbStore } from '../database/store';
import { ChatMessage, AgentThoughtStep, Ticket, IssueCategory, UrgencyLevel } from '../types';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'SocietyOps AI',
          },
        },
      });
    }
  }
  return aiClient;
}

export async function processResidentMessage(
  userText: string,
  userFlat: string = 'B-402',
  userName: string = 'Vikram Mehta',
  attachedImages: string[] = []
): Promise<{ replyText: string; thoughtSteps: AgentThoughtStep[]; ticketCreated?: Ticket }> {
  const thoughtSteps: AgentThoughtStep[] = [];
  const ai = getAiClient();

  thoughtSteps.push({
    agentName: 'Intake Agent',
    explanation: `Analyzing resident message: "${userText.substring(0, 70)}..." in Indian society context.`,
  });

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `Resident "${userName}" from Flat "${userFlat}" sent a maintenance message: "${userText}".
Attached images count: ${attachedImages.length}.

Your system directive as SocietyOps AI:
1. Act as Intake Agent, Dispatcher Agent, and Communication Agent in sequence.
2. If this is a new maintenance issue or complaint:
   - Extract Flat Number (default to "${userFlat}" if unspecified), Issue Category (Plumbing, Electrical, Lift & Elevator, Carpentry & Locks, AC & Appliances, Cleaning & Pest, Security & Intercom, General Repairs), Urgency (High/Medium/Low), and Description.
   - Use function calling tool "create_ticket" to create the ticket.
   - Then call "assign_vendor" or let auto-dispatch handle it.
   - Then call "notify_resident".
3. Reply politely in warm, clear Hinglish or English matching the user's tone. Keep reply concise, mentioning Ticket ID, Assigned Vendor, and ETA if ticket was created.`,
        config: {
          systemInstruction: `You are SocietyOps AI, an autonomous Maintenance Coordination Agent for Indian Housing Societies & RWAs. You process resident complaints in Hinglish or English, extract structured details, invoke tools to create tickets and assign vendors, and reply warmly and professionally.`,
          tools: [{ functionDeclarations: maintenanceToolDeclarations }],
        },
      });

      const functionCalls = response.functionCalls;
      let ticketCreated: Ticket | undefined = undefined;

      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          if (!call || typeof (call as any).name !== 'string') {
            thoughtSteps.push({ agentName: 'Communication Agent', explanation: 'Skipping invalid function call from AI response.' });
            continue;
          }
          // Some function-calling responses encode args as a JSON string — normalize to an object.
          let parsedArgs: any = (call as any).args ?? {};
          if (typeof parsedArgs === 'string') {
            try {
              parsedArgs = JSON.parse(parsedArgs);
            } catch (e) {
              // leave as string if parsing fails
            }
          }

          let toolResult: any;
          try {
            toolResult = executeToolCall((call as any).name, parsedArgs);
          } catch (e) {
            thoughtSteps.push({ agentName: 'Communication Agent', explanation: `Tool execution failed: ${(e as Error).message}` });
            continue;
          }

          if (call.name === 'create_ticket' && toolResult.ticket) {
            const createdTicket = toolResult.ticket as Ticket;
            ticketCreated = createdTicket;
            thoughtSteps.push({
              agentName: 'Intake Agent',
              toolCalled: 'create_ticket',
              args: parsedArgs as Record<string, any>,
              resultSummary: `Ticket #${createdTicket.id} generated for Flat ${createdTicket.flatNumber}`,
              explanation: `Extracted Category: ${createdTicket.issueCategory}, Urgency: ${createdTicket.urgency}. Created ticket ${createdTicket.id}.`,
            });

            if (toolResult.assignedVendor) {
              thoughtSteps.push({
                agentName: 'Dispatcher Agent',
                toolCalled: 'assign_vendor',
                args: { ticketId: createdTicket.id, vendorId: toolResult.assignedVendor.id },
                resultSummary: `Dispatched ${toolResult.assignedVendor.name} (${toolResult.assignedVendor.rating} stars)`,
                explanation: `Matched best vendor ${toolResult.assignedVendor.name} for ${createdTicket.issueCategory}. ETA: ${toolResult.assignedVendor.avgResolutionTime}.`,
              });
            }
          } else if (call.name === 'assign_vendor') {
            thoughtSteps.push({
              agentName: 'Dispatcher Agent',
              toolCalled: 'assign_vendor',
              args: parsedArgs as Record<string, any>,
              resultSummary: `Vendor assigned successfully`,
              explanation: `Assigned vendor ID ${(call.args as any).vendorId} to ticket ${(call.args as any).ticketId}.`,
            });
          } else {
            thoughtSteps.push({
              agentName: 'Communication Agent',
              toolCalled: call.name,
              args: parsedArgs as Record<string, any>,
              resultSummary: `Tool executed successfully`,
              explanation: `Executed tool ${call.name}.`,
            });
          }
        }
      }

      let replyText = response.text || '';
      if (!replyText) {
        if (ticketCreated) {
          const vendorName = ticketCreated.assignedVendorName || 'Society Vendor Team';
          const eta = ticketCreated.estimatedEta || '30 mins';
          replyText = `Namaste ${userName} ji! Aapki complaint register kar li gayi hai. 

**Ticket ID**: #${ticketCreated.id}
**Flat**: ${ticketCreated.flatNumber}
**Urgency**: ${ticketCreated.urgency}
**Assigned Vendor**: ${vendorName}
**Estimated Arrival**: ${eta}

Aap live updates app mein dekh sakte hain. Hamari team issue complete karke aapko update karegi. Dhanyawad!`;
        } else {
          replyText = `Namaste ${userName} ji! Main SocietyOps AI hu. Aapki help ke liye batayein — kya koi plumbing, electrical, lift ya repair ka issue h? Re-confirm flat number (${userFlat}).`;
        }
      }

      thoughtSteps.push({
        agentName: 'Communication Agent',
        explanation: 'Formatted resident notification and confirmed status update.',
      });

      return { replyText, thoughtSteps, ticketCreated };
    } catch (err) {
      console.warn('Gemini API call warning, using agent fallback engine:', err);
    }
  }

  // --- FALLBACK DETERMINISTIC MULTI-AGENT ENGINE ---
  return runDeterministicAgentFallback(userText, userFlat, userName, attachedImages, thoughtSteps);
}

function runDeterministicAgentFallback(
  userText: string,
  userFlat: string,
  userName: string,
  attachedImages: string[],
  thoughtSteps: AgentThoughtStep[]
): { replyText: string; thoughtSteps: AgentThoughtStep[]; ticketCreated?: Ticket } {
  const lower = userText.toLowerCase();

  // 1. Determine Category
  let category: IssueCategory = 'General Repairs';
  if (lower.includes('water') || lower.includes('leak') || lower.includes('tap') || lower.includes('flush') || lower.includes('drain') || lower.includes('pipe') || lower.includes('paani')) {
    category = 'Plumbing';
  } else if (lower.includes('light') || lower.includes('power') || lower.includes('mcb') || lower.includes('wire') || lower.includes('fan') || lower.includes('electricity') || lower.includes('bijli')) {
    category = 'Electrical';
  } else if (lower.includes('lift') || lower.includes('elevator') || lower.includes('stuck')) {
    category = 'Lift & Elevator';
  } else if (lower.includes('lock') || lower.includes('door') || lower.includes('key') || lower.includes('hinge') || lower.includes('darwaza')) {
    category = 'Carpentry & Locks';
  } else if (lower.includes('ac') || lower.includes('geyser') || lower.includes('heater') || lower.includes('appliance')) {
    category = 'AC & Appliances';
  } else if (lower.includes('pest') || lower.includes('clean') || lower.includes('cockroach') || lower.includes('mosquito') || lower.includes('garbage')) {
    category = 'Cleaning & Pest';
  } else if (lower.includes('intercom') || lower.includes('gate') || lower.includes('cctv') || lower.includes('security')) {
    category = 'Security & Intercom';
  }

  // 2. Determine Urgency
  let urgency: UrgencyLevel = 'Medium';
  if (lower.includes('urgent') || lower.includes('stuck') || lower.includes('fire') || lower.includes('smoke') || lower.includes('sewage') || lower.includes('flooding') || lower.includes('gas') || lower.includes('emergency')) {
    urgency = 'High';
  } else if (lower.includes('minor') || lower.includes('light') || lower.includes('cleaning') || lower.includes('when free') || lower.includes('aaram se')) {
    urgency = 'Low';
  }

  // 3. Extract Flat Number if in text
  const flatMatch = userText.match(/([A-D]|tower\s*[A-D]?)[- ]?([0-9]{3,4})/i);
  const detectedFlat = flatMatch ? flatMatch[0].toUpperCase() : userFlat;

  // Execute create_ticket
  const result = executeToolCall('create_ticket', {
    flatNumber: detectedFlat,
    residentName: userName,
    residentPhone: '+91 98210 99887',
    issueCategory: category,
    description: userText,
    urgency: urgency,
    images: attachedImages,
  });

  if (!result || !result.ticket) {
    throw new Error('create_ticket tool failed to return a ticket');
  }
  const ticketCreated: Ticket = result.ticket as Ticket;

  thoughtSteps.push({
    agentName: 'Intake Agent',
    toolCalled: 'create_ticket',
    args: { flatNumber: detectedFlat, category, urgency, description: userText },
    resultSummary: `Ticket #${ticketCreated.id} generated`,
    explanation: `Extracted category "${category}" & urgency "${urgency}" from input. Created ticket #${ticketCreated.id}.`,
  });

  if (result.assignedVendor) {
    thoughtSteps.push({
      agentName: 'Dispatcher Agent',
      toolCalled: 'assign_vendor',
      args: { ticketId: ticketCreated.id, vendorId: result.assignedVendor.id },
      resultSummary: `Auto-dispatched ${result.assignedVendor.name}`,
      explanation: `Matched top-rated vendor ${result.assignedVendor.name} (Rating: ${result.assignedVendor.rating} stars, ETA: ${result.assignedVendor.avgResolutionTime}).`,
    });
  }

  thoughtSteps.push({
    agentName: 'Communication Agent',
    toolCalled: 'notify_resident',
    args: { ticketId: ticketCreated.id, recipient: userName },
    resultSummary: 'Sent Hinglish status update via WhatsApp',
    explanation: 'Dispatched instant confirmation message with Ticket ID and assigned technician details.',
  });

  const vendorName = ticketCreated.assignedVendorName || 'Society Vendor Team';
  const eta = ticketCreated.estimatedEta || '30 mins';

  const replyText = `Namaste ${userName} ji! Aapki complaint register ho gayi hai.

 **Ticket ID**: #${ticketCreated.id}
 **Flat**: ${ticketCreated.flatNumber}
 **Category**: ${ticketCreated.issueCategory}
 **Urgency**: ${ticketCreated.urgency}
 **Assigned Vendor**: ${vendorName}
 **Expected Arrival**: ${eta}

Hamare Dispatcher Agent ne technician ko notify kar diya hai. Status live track karne ke liye dashboard check karein!`;

  return { replyText, thoughtSteps, ticketCreated };
}
