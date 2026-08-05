export const en = {
  common: {
    home: "Home",
    login: "Login",
    logout: "Logout",
    settings: "Settings",
    processing: "Processing...",
    back: "Back",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    error: "Error",
    success: "Success",
    languageTooltip: "App language",
    languageAriaLabel: "Select language",
    terms: "Terms",
    free: "100% Free · Open Source",
    noCreditCard: "No credit card required",
    selfHost: "Self-hostable",
    verified: "Accurate App Market Verified",
  },
  home: {
    hero: {
      title: "Export & Import Manager for",
      titleHighlight: "Inventory Adjustments",
      subtitle:
        "Exima simplifies bulk export and import of inventory adjustments with validation, preview, and secure Accurate credential management.",
      getStarted: "Get Started",
      viewGithub: "View on GitHub",
    },
    features: {
      bulk: {
        title: "Bulk Import & Export",
        description:
          "Validate & download CSV/XLSX templates, then export or import batches with a 20-row preview before running.",
      },
      security: {
        title: "Secure Credentials",
        description:
          "Accurate OAuth + HMAC-SHA256 signature with built-in rate limits (8 rps, 8 concurrent).",
      },
      workflow: {
        title: "Unified Workflow",
        description:
          "Choose the Inventory Adjustment module, then select export (get data) or import (input data).",
      },
      kiosk: {
        title: "Kiosk Mode (Self-Checkout)",
        description:
          "Kiosk mode for self-scanning, suitable for warehouses/outlets so teams can input adjustments without repeated logins.",
      },
    },
    benefits: {
      title: "Why choose Exima?",
      badge: "Benefits",
      description:
        "Exima is designed to simplify the export and import process of inventory adjustment data from Accurate Online. With an intuitive interface and built-in validation features, you can manage data more efficiently.",
      free: "100% Free, no hidden costs",
      responsive: "Responsive and modern dashboard",
      realtime: "Real-time job status notifications",
      multiAccount: "Supports multi-Accurate accounts",
      validation: "Data validation before import",
      exportFormat: "Export in various formats",
    },
    setup: {
      title: "Quick Start",
      subtitle: "Self-host via Docker",
      step1: "Clone repository & copy .env.example",
      step2: "Fill Accurate credentials + NextAuth",
      step3: "docker compose up -d --build",
      note: "Continue with `docker compose exec app npm run db:push`.",
    },
  },
  login: {
    title: "Welcome Back",
    subtitle: "Login to your account to continue",
    email: "Email",
    password: "Password",
    placeholderEmail: "name@email.com",
    placeholderPassword: "Enter password",
    forgotPassword: "Forgot password?",
    submit: "Login",
    errorTitle: "Login failed",
    errorInvalid: "Invalid email or password",
    errorGeneric: "An error occurred. Please try again.",
    or: "or",
    noAccount: "Don't have an account?",
    register: "Register here",
    terms: "Terms & Conditions",
    branding: {
      title: "Manage Inventory Adjustments with Ease",
      description:
        "Bulk export and import platform for Accurate Online with validation, preview, and guaranteed security.",
    },
    features: {
      export: {
        title: "Bulk Export",
        description: "Export to CSV, XLSX, or JSON",
      },
      import: {
        title: "Bulk Import",
        description: "Import with automatic validation",
      },
      oauth: {
        title: "OAuth Integration",
        description: "Secure connection to Accurate",
      },
      security: {
        title: "Security",
        description: "HMAC-SHA256 signature",
      },
    },
  },
  kiosk: {
    backToHome: "Back to Home",
    fullscreen: "Full Screen",
    exitFullscreen: "Exit Full Screen",
    scanProduct: "Scan Product",
    scanDescription: "Items go directly into the cart",
    loadingTitle: "Loading Node",
    loadingSubtitle: "Synchronizing secure session...",
    selectDatabase: "Select Database",
    selectDatabaseSubtitle:
      "Select an Accurate database to start the kiosk session",
    noDatabases: "No databases found",
  },
  dashboard: {
    welcome: "Welcome back 👋",
    title: "Dashboard",
    systemOperational: "All systems operational",
    stats: {
      totalExports: "Total Exports",
      totalExportsDesc: "All export operations",
      totalImports: "Total Imports",
      totalImportsDesc: "All import operations",
      connectedAccounts: "Connected Accounts",
      connectedAccountsDesc: "Active Accurate accounts",
      thisMonth: "This Month",
      thisMonthDesc: "Export & import operations",
      jobs: "jobs",
      trendLabel: "vs last month",
    },
    quickActions: {
      title: "Quick Actions",
      export: {
        title: "New Export",
        description: "Export inventory adjustment to CSV, XLSX, or JSON",
      },
      import: {
        title: "New Import",
        description: "Import inventory adjustment from your file",
      },
      kiosk: {
        title: "Self-Checkout",
        description: "Scan items for quick inventory checkout",
      },
      accounts: {
        title: "Manage Accounts",
        description: "Connect or manage Accurate accounts",
      },
    },
    charts: {
      weeklyTitle: "Weekly Activity",
      monthlyTitle: "Monthly Trend",
      viewDetail: "View detail",
      growth: "growth",
      totalMonth: "Total this month",
      operations: "operations",
      exports: "Exports",
      imports: "Imports",
      totalOperations: "Total Operations",
    },
    activity: {
      title: "Recent Activity",
      noActivity: "No activity yet",
      noActivityDesc: "Your export and import operations will appear here",
      startExport: "Start Export",
    },
    nav: {
      dashboard: "Dashboard",
      inventoryAdjustment: "Inventory Adjustment",
      export: "Export (Get data)",
      import: "Import (Input data)",
      selfCheckout: "Self-Checkout",
      peminjaman: "Borrowing",
      credentials: "Accurate Credentials",
    },
    userMenu: {
      account: "Account",
      profile: "Profile",
      settings: "Settings",
      links: "Links",
      openKiosk: "Open Kiosk Mode",
      logout: "Logout",
    },
    status: {
      connected: "Connected to Accurate",
      operational: "API Status: Operational",
    },
    pos: {
      cashierTitle: "POS Cashier",
      storeTitle: "Staff Store Reservation",
      analyticsTitle: "POS Sales Analytics",
      warehouseTitle: "POS Warehouse Settings",
      credential: "Accurate credential",
      search: "Barcode or item name",
      searchButton: "Search",
      add: "Add",
      cart: "Cart",
      checkout: "Checkout",
      reserve: "Reserve for pickup",
      staffEmail: "Staff email",
      pickupExpiry: "Pickup expiry",
      save: "Save warehouse",
      warehouse: "Warehouse",
      saleCompleted: "Sale completed",
      reservationCreated: "Reservation created",
      setupRequired: "POS warehouse is not configured",
      revenue: "Revenue",
      restockCost: "Restock cost",
      profit: "Profit",
      unitsSold: "Units sold",
      sales: "Sales",
      item: "Item",
      units: "Units",
      cost: "Cost",
    },
    credentials: {
      title: "Accurate Credentials",
      connectTitle: "Connect Accurate",
      connectDescription:
        "Connect your Accurate account to enable data export and import. App Key and Signature Secret are configured via environment variables.",
      connectButton: "Connect Accurate",
      connectedAccountsTitle: "Connected Accounts",
      table: {
        appKey: "App Key",
        host: "Host",
        connectedAt: "Connected At",
        action: "Action",
        notDetected: "Not detected",
      },
      disconnectTooltip: "Disconnect account",
      disconnectConfirm: "Are you sure you want to delete this credential?",
      notifications: {
        connectedTitle: "Connected",
        connectedMessage: "Accurate API Token successfully saved from OAuth",
        errorTitle: "OAuth Error",
        errorGeneric: "Failed to connect to Accurate",
        deleteSuccessTitle: "Success",
        deleteSuccessMessage: "Credential deleted",
        deleteErrorTitle: "Failed",
        deleteErrorMessage: "Failed to delete credential",
      },
    },
    emptyState: {
      noData: {
        title: "No data yet",
        description: "Start by adding data to see it here.",
      },
      noResults: {
        title: "No results found",
        description:
          "Try changing your search or filter to find what you're looking for.",
      },
      noConnection: {
        title: "Connection error",
        description:
          "Could not connect to the server. Check your internet connection and try again.",
      },
      emptyFolder: {
        title: "This folder is empty",
        description: "Upload files or create new items to get started.",
      },
      emptyCart: {
        title: "Your cart is empty",
        description: "Scan items to add them to your cart.",
      },
      noCredentials: {
        title: "No accounts connected",
        description:
          "Connect an Accurate account to start importing and exporting data.",
      },
      error: {
        title: "An error occurred",
        description:
          "An unexpected error occurred. Please try again or contact support.",
      },
    },
  },
  inventoryAdjustment: {
    export: {
      title: "Export Inventory Adjustment",
      description:
        "Export inventory adjustment data from Accurate to CSV, XLSX, or JSON files.",
      steps: {
        selectAccount: "Select Account",
        selectAccountDesc: "Choose Accurate credentials",
        config: "Configuration",
        configDesc: "Date range & format",
        preview: "Preview",
        previewDesc: "Review data before export",
      },
      config: {
        dateRange: "Date Range",
        format: "File Format",
        formats: {
          csv: {
            label: "CSV (Comma Separated)",
            description: "Best for bulk data import",
          },
          xlsx: {
            label: "Excel (XLSX)",
            description: "Easy to read & edit manually",
          },
          json: {
            label: "JSON Data",
            description: "For system integration",
          },
        },
      },
      preview: {
        title: "Data Preview",
        subtitle: "Showing first 20 rows of {total} rows found.",
        empty: "No data found for this date range.",
        table: {
          date: "Date",
          number: "Number",
          description: "Description",
          item: "Item",
          quantity: "Quantity",
          unit: "Unit",
        },
      },
      actions: {
        next: "Continue",
        back: "Back",
        export: "Export Now",
        downloading: "Downloading...",
      },
      notifications: {
        successTitle: "Export Successful",
        successMessage: "Data successfully exported to {format}",
        errorTitle: "Export Failed",
      },
    },
    import: {
      title: "Import Inventory Adjustment",
      description:
        "Import inventory adjustment data from a file to Accurate Online.",
      steps: {
        selectAccount: "Select Account",
        selectAccountDesc: "Choose destination credentials",
        upload: "Upload File",
        uploadDesc: "Select & validate file",
        review: "Review & Import",
        reviewDesc: "Validation & import results",
      },
      upload: {
        title: "Upload Data File",
        description: "Use our template to ensure the data format is correct.",
        dropzone: {
          title: "Click or drag file here",
          subtitle: "Supports .csv or .xlsx files only (Max. 5MB)",
        },
        template: {
          title: "Data Template",
          description: "Download a sample file as a column format reference.",
          download: "Download CSV Template",
          columns: {
            date: "Date (DD/MM/YYYY)",
            number: "Transaction Number",
            description: "Transaction Description",
            itemNo: "Item Number",
            quantity: "Quantity",
            unit: "Unit",
            warehouse: "Warehouse",
            detailDescription: "Detail Description",
          },
        },
      },
      review: {
        title: "Validation Results",
        autoNumber: "Use Accurate auto-numbering",
        summary: {
          valid: "{count} valid rows",
          invalid: "{count} error rows",
        },
        table: {
          row: "Row",
          status: "Status",
          errors: "Errors",
          valid: "Ready to import",
        },
      },
      actions: {
        validate: "Validate File",
        validating: "Validating...",
        import: "Import to Accurate",
        importing: "Importing...",
        reset: "Repeat Process",
      },
      notifications: {
        validationSuccessTitle: "Validation Complete",
        validationSuccessMessage:
          "Found {valid} valid rows and {invalid} error rows.",
        validationErrorTitle: "Validation Failed",
        importSuccessTitle: "Import Complete",
        importSuccessMessage:
          "Successfully imported {success} transactions. {failed} failed.",
        importErrorTitle: "Import Failed",
      },
    },
  },
  selfCheckout: {
    title: "Self-Checkout",
    subtitle: "Scan items for quick inventory checkout",
    scanner: {
      placeholder: "Scan item barcode...",
      lookup: "Looking up item...",
      notFound: "Item not found",
    },
    staff: {
      title: "Staff Information",
      email: "Staff Email",
      placeholder: "Scan badge or enter email",
    },
    cart: {
      title: "Shopping Cart",
      empty: "Cart is empty. Start scanning items.",
      item: "Item",
      qty: "Qty",
      total: "Total Items",
      confirmDelete: "Remove from cart?",
    },
    actions: {
      checkout: "Complete Checkout",
      cancel: "Cancel",
      newSession: "New Session",
    },
    notifications: {
      itemAdded: "Added to cart",
      checkoutSuccess: "Checkout Successful",
      checkoutMessage: "Adjustment number: {number}",
      checkoutError: "Checkout Failed",
    },
  },
  terms: {
    title: "Terms & Conditions",
    subtitle: "By using Exima, you agree to the following terms:",
    list: [
      "Access to Accurate Online requires official credentials (App Key, Signature Secret, API Token) from your account.",
      "Exima only accesses data necessary for export/import of inventory adjustments.",
      "You are responsible for the accuracy of imported data and the date range of exported data.",
      "Do not share your credentials with others; delete credentials if no longer in use.",
      "The service is provided as-is without warranty; use with consideration of your company's internal policies.",
    ],
    integration: {
      title: "Accurate Integration",
      description:
        "Integration is done through Accurate OAuth and official credentials from the Accurate App Market. For Cloud, access will be reviewed by an admin. For self-host, you manage your own App Key, Secret, and callback URL according to your environment.",
    },
    footer: {
      copyright: "MAD Labs by Millennia World School. All rights reserved.",
    },
  },
};
