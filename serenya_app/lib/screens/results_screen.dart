import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/providers/health_data_provider.dart';
import '../core/constants/app_constants.dart';
import '../widgets/document_card.dart';
import '../widgets/confidence_indicator.dart';
import '../widgets/medical_disclaimer.dart';
import '../models/local_database_models.dart';

class ResultsScreen extends StatefulWidget {
  final int? documentId;

  const ResultsScreen({
    Key? key,
    this.documentId,
  }) : super(key: key);

  @override
  _ResultsScreenState createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen> {
  SerenyaContent? _selectedDocument;
  List<SerenyaContent> _interpretations = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadResults();
    });
  }

  void _loadResults() async {
    final dataProvider = context.read<HealthDataProvider>();
    await dataProvider.loadDocuments();

    if (widget.documentId != null) {
      _selectedDocument = dataProvider.documents
          .where((doc) => doc.id == widget.documentId)
          .firstOrNull;
    } else {
      // Show most recent completed document
      final completedDocs = dataProvider.getDocumentsByStatus(ProcessingStatus.completed);
      if (completedDocs.isNotEmpty) {
        _selectedDocument = completedDocs.first;
      }
    }

    if (_selectedDocument != null) {
      await dataProvider.loadInterpretations();
      _interpretations = dataProvider.interpretations;
    }

    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(
          'Results Analysis',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        backgroundColor: Colors.blue[600],
        elevation: 0,
        iconTheme: IconThemeData(color: Colors.white),
      ),
      body: _selectedDocument == null
          ? _buildNoResults()
          : _buildResults(),
    );
  }

  Widget _buildNoResults() {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(AppConstants.largePadding),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.assignment_outlined,
              size: 64,
              color: Colors.grey[400],
            ),
            SizedBox(height: AppConstants.defaultPadding),
            Text(
              'No Results Available',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.grey[700],
              ),
            ),
            SizedBox(height: AppConstants.smallPadding),
            Text(
              'Upload a health document to see AI analysis results here.',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults() {
    return SingleChildScrollView(
      padding: EdgeInsets.all(AppConstants.defaultPadding),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Document info
          DocumentCard(
            document: _selectedDocument!,
            showConfidence: true,
            onTap: null, // Don't allow navigation from results screen
          ),
          SizedBox(height: AppConstants.defaultPadding),

          // AI Analysis section
          if (_selectedDocument!.aiConfidenceScore != null) ...[
            Text(
              'AI Analysis',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
            ),
            SizedBox(height: AppConstants.smallPadding),
            
            ConfidenceCard(
              confidenceScore: _selectedDocument!.aiConfidenceScore!,
              message: _selectedDocument!.interpretationText ?? 'Analysis complete.',
              onConsultDoctor: () => _showDoctorConsultationInfo(),
            ),
            SizedBox(height: AppConstants.defaultPadding),
          ],

          // Detailed interpretations
          if (_interpretations.isNotEmpty) ...[
            Text(
              'Detailed Analysis',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.grey[800],
              ),
            ),
            SizedBox(height: AppConstants.smallPadding),
            
            ..._interpretations.map((interpretation) => Card(
              elevation: 1,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppConstants.borderRadius),
              ),
              child: Padding(
                padding: EdgeInsets.all(AppConstants.defaultPadding),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          _getContentTypeLabel(interpretation.contentType),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.grey[800],
                          ),
                        ),
                        Spacer(),
                        ConfidenceIndicator(
                          confidenceScore: interpretation.confidenceScore,
                          showDetails: false,
                        ),
                      ],
                    ),
                    SizedBox(height: AppConstants.smallPadding),
                    Text(
                      interpretation.content,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey[700],
                        height: 1.4,
                      ),
                    ),
                    if (interpretation.medicalFlags.isNotEmpty) ...[
                      SizedBox(height: AppConstants.smallPadding),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: interpretation.medicalFlags.map((flag) => 
                          Chip(
                            label: Text(
                              flag,
                              style: TextStyle(fontSize: 11),
                            ),
                            backgroundColor: Colors.orange[50],
                            side: BorderSide(color: Colors.orange[200]!),
                          ),
                        ).toList(),
                      ),
                    ],
                  ],
                ),
              ),
            )).toList(),
            SizedBox(height: AppConstants.defaultPadding),
          ],

          // Medical disclaimers
          MedicalDisclaimer(
            type: DisclaimerType.general,
            isCompact: false,
          ),
          SizedBox(height: AppConstants.smallPadding),
          
          if (_selectedDocument!.aiConfidenceScore != null && 
              _selectedDocument!.aiConfidenceScore! < AppConstants.moderateConfidenceThreshold)
            MedicalDisclaimer(
              type: DisclaimerType.consultation,
              isCompact: false,
            ),
        ],
      ),
    );
  }

  String _getContentTypeLabel(ContentType type) {
    switch (type) {
      case ContentType.result:
        return 'Analysis Result';
      case ContentType.report:
        return 'Comprehensive Report';
    }
  }

  void _showDoctorConsultationInfo() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Healthcare Provider Consultation'),
        content: Text(
          'Based on your results, we recommend discussing these findings with a healthcare provider. '
          'They can provide proper medical evaluation and next steps based on your complete health history.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Got it'),
          ),
        ],
      ),
    );
  }
}