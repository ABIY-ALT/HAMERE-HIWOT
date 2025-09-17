import type { Language } from './i18n';

export const formatToEthiopianDate = (gregorianDateString: string | Date, language: Language): string => {
  try {
    const date = new Date(gregorianDateString);
    if (isNaN(date.getTime())) {
      // Return the original string if it's not a valid date
      return String(gregorianDateString);
    }
    
    // For Amharic, the 'ethiopic' calendar is the default, but we specify it for clarity.
    // For English, we use the 'en-US' locale and specify the 'ethiopia' calendar (modern).
    // The previous tag 'en-US-u-ca-ethiopian' was invalid.
    const locale = language === 'am' ? 'am-ET' : 'en-US';
    const calendar = language === 'am' ? 'ethiopic' : 'ethiopia';
    
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      calendar: calendar,
    }).format(date);

  } catch (error) {
    console.error("Error formatting date:", error);
    return String(gregorianDateString);
  }
};
